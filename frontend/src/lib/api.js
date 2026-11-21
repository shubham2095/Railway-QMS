export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors || null;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

function toQuery(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, { params, body, form } = {}) {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (form) {
    init.body = form; // multipart - the browser sets the boundary
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}${toQuery(params)}`, init);
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the API running?');
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.message || `Request failed (${res.status})`, data?.errors);
  }
  return data;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body: body ?? {} }),
  put: (path, body) => request('PUT', path, { body: body ?? {} }),
  del: (path) => request('DELETE', path),
  upload: (path, form) => request('POST', path, { form }),
};
