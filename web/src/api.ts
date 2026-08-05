const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'mon511_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

const LAYER_PREFS_KEY = 'mon511_layer_prefs';

export interface LayerPrefs {
  travaux_routiers: boolean;
  conditions_hivernales: boolean;
}

const DEFAULT_LAYER_PREFS: LayerPrefs = { travaux_routiers: false, conditions_hivernales: false };

/** Repli localStorage pour les usagers non connectés — les usagers connectés
 * ont leurs préférences persistées côté serveur (users.map_layer_preferences). */
export function getLocalLayerPrefs(): LayerPrefs {
  try {
    const raw = localStorage.getItem(LAYER_PREFS_KEY);
    return raw ? { ...DEFAULT_LAYER_PREFS, ...JSON.parse(raw) } : DEFAULT_LAYER_PREFS;
  } catch {
    return DEFAULT_LAYER_PREFS;
  }
}

export function setLocalLayerPrefs(prefs: LayerPrefs) {
  localStorage.setItem(LAYER_PREFS_KEY, JSON.stringify(prefs));
}

/** Décode le rôle depuis le payload JWT — usage UI uniquement (affichage
 * conditionnel des liens admin), jamais pour la sécurité réelle : le backend
 * applique ses propres gardes de rôle indépendamment de ce que le client affiche. */
export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
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
