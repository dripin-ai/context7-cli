const BASE = 'https://context7.com/api/v1';
export const TIMEOUT_MS = 15000;

// A Context7 library ID is /org/project, optionally /org/project/version.
const ID_SHAPE = /^\/[^/]+\/[^/]+(?:\/[^/]+)?$/;

function headers(apiKey) {
  const h = {};
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
  return h;
}

const STATUS_HINTS = {
  401: 'missing or invalid API key — set CONTEXT7_API_KEY or pass --api-key',
  403: 'API key rejected — check CONTEXT7_API_KEY or --api-key',
  404: 'unknown library ID — run "c7 resolve <query>" to find a valid one',
  429: 'rate limited — wait and retry, or use an API key for higher limits',
};

function apiError(what, resp) {
  const hint = STATUS_HINTS[resp.status];
  return new Error(`${what} failed: ${resp.status}${hint ? ` — ${hint}` : ''}`);
}

/** Validate a Context7 library ID and percent-encode every path segment. */
export function encodeLibraryId(libraryId) {
  const invalid = () =>
    new Error(
      `Invalid Context7 library ID "${libraryId}" — expected /org/project or /org/project/version`,
    );
  if (typeof libraryId !== 'string' || !ID_SHAPE.test(libraryId)) throw invalid();
  const segments = libraryId.slice(1).split('/');
  if (segments.some(s => s === '.' || s === '..')) throw invalid();
  return '/' + segments.map(encodeURIComponent).join('/');
}

/** The single place a request is made: one timeout, one status check, one timeout message. */
async function request(url, apiKey, what) {
  let resp;
  try {
    resp = await fetch(url, { headers: headers(apiKey), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error(
        `${what} failed: context7.com did not respond within ${TIMEOUT_MS / 1000}s — retry, or check your network`,
        { cause: err },
      );
    }
    throw err;
  }
  if (!resp.ok) throw apiError(what, resp);
  return resp;
}

export async function resolve(libraryName, apiKey) {
  const url = `${BASE}/search?query=${encodeURIComponent(libraryName)}&limit=10`;
  const data = await (await request(url, apiKey, 'Search')).json();
  return Array.isArray(data.results) ? data.results : [];
}

export async function getDocs(libraryId, topic, apiKey, tokens = 5000) {
  const params = new URLSearchParams({ tokens: String(tokens) });
  if (topic) params.set('topic', topic);

  const url = `${BASE}${encodeLibraryId(libraryId)}?${params}`;
  const resp = await request(url, apiKey, 'Docs fetch');

  const type = (resp.headers.get('content-type') || '').split(';')[0].trim();
  const body = await resp.text();

  if (type === 'application/json') {
    let data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      throw new Error(`Docs fetch returned malformed JSON (${body.length} bytes)`, { cause: err });
    }
    if (data.snippets?.length) {
      return data.snippets
        .map(s => {
          const header = s.title ? `## ${s.title}` : s.filePath ? `## ${s.filePath}` : '';
          return [header, s.content].filter(Boolean).join('\n');
        })
        .join('\n\n---\n\n');
    }
    if (data.content) return data.content;
    // Neither snippets nor content: an envelope is not documentation. Returning the empty
    // string routes it to the same "No docs found" exit as an empty markdown body —
    // printing the raw JSON would pass it off as docs at exit 0.
    return '';
  }

  if (type === 'text/plain' || type === 'text/markdown') return body;

  throw new Error(
    `Docs fetch returned unexpected content-type "${type || '(none)'}" — not documentation`,
  );
}
