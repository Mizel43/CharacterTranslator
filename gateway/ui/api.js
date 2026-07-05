const CSRF_STORAGE_KEY = 'qct.csrf.v1';

function getCookie(name) {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function parsePayload(response, rawText) {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

export function setCsrfToken(token) {
  if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
}

export function getCsrfToken() {
  return sessionStorage.getItem(CSRF_STORAGE_KEY) || decodeURIComponent(getCookie('qct_csrf')) || '';
}

export function hydrateCsrfToken() {
  const token = decodeURIComponent(getCookie('qct_csrf')) || '';
  if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  return token;
}

export function clearSessionArtifacts() {
  sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (!csrfToken) throw Object.assign(new Error('CSRF token is missing. Re-pair this browser.'), { status: 401 });
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  const rawText = await response.text();
  const payload = parsePayload(response, rawText);

  if (!response.ok) {
    if (response.status === 401) clearSessionArtifacts();
    const message = payload.error || payload.raw || `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status, payload });
  }

  if (payload.csrfToken) setCsrfToken(payload.csrfToken);
  return payload;
}
