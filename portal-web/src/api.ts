const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// Clé distincte de l'appli citoyenne — évite qu'ouvrir le portail dans un
// onglet affecte la session de l'appli principale dans un autre onglet du
// même navigateur.
const TOKEN_KEY = 'mon511_portal_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    // Les jetons JWT utilisent le base64URL (- et _ plutôt que + et /,
    // souvent sans le remplissage =), pas le base64 standard qu'atob()
    // attend — un décodage direct pouvait donc échouer silencieusement
    // selon le contenu exact du jeton, de façon différente d'un
    // navigateur à l'autre.
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(base64Url.length + (4 - (base64Url.length % 4)) % 4, '=');
    const payload = JSON.parse(atob(base64));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(errorBody.message ?? `Erreur ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};
