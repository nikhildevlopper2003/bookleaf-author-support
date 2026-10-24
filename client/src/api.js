const TOKEN_KEY = 'bookleaf_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, path, body) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // a 401 on login just means wrong password; elsewhere it means the session ended
    if (res.status === 401 && path !== '/auth/login') onUnauthorized();
    throw new ApiError(res.status, data?.error?.message ?? 'Something went wrong', data?.error?.details);
  }
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),

  books: () => request('GET', '/books'),

  tickets: (filters = {}) => request('GET', `/tickets${qs(filters)}`),
  ticket: (id) => request('GET', `/tickets/${id}`),
  createTicket: (payload) => request('POST', '/tickets', payload),
  postMessage: (id, payload) => request('POST', `/tickets/${id}/messages`, payload),

  updateTicket: (id, patch) => request('PATCH', `/tickets/${id}`, patch),
  addNote: (id, body) => request('POST', `/tickets/${id}/notes`, { body }),
  draft: (id, refresh = false) => request('GET', `/tickets/${id}/draft${refresh ? '?refresh=true' : ''}`),
};
