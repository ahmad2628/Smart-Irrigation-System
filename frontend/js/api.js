// Thin fetch wrapper. Reads JWT from localStorage and adds it to every request.

const API = (() => {
  const TOKEN_KEY = 'smart_irrigation_token';
  const USER_KEY  = 'smart_irrigation_user';

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); };
  const getUser   = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };
  const setUser   = (u) => localStorage.setItem(USER_KEY, JSON.stringify(u));

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let payload = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { payload = await res.json(); } catch {}
    }
    if (!res.ok) {
      const err = new Error(payload?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  return {
    getToken, setToken, clearToken, getUser, setUser,
    get:    (p)    => request('GET',    p),
    post:   (p, b) => request('POST',   p, b ?? {}),
    put:    (p, b) => request('PUT',    p, b ?? {}),
    del:    (p)    => request('DELETE', p),
  };
})();
