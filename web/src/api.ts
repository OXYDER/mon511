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
  signalements_mon511: boolean;
  signalements_amis: boolean;
  travaux_routiers: boolean;
  conditions_hivernales: boolean;
  avertissements: boolean;
  debit_circulation: boolean;
  feux_foret: boolean;
  cabanes_a_sucre: boolean;
}

export const DEFAULT_LAYER_PREFS: LayerPrefs = {
  // Activé par défaut au chargement du site — contrairement aux autres
  // couches (travaux, feux, etc.), les signalements communautaires sont
  // le cœur du site, ils doivent être visibles d'entrée de jeu.
  signalements_mon511: true,
  signalements_amis: false,
  travaux_routiers: false,
  conditions_hivernales: false,
  avertissements: false,
  debit_circulation: false,
  feux_foret: false,
  cabanes_a_sucre: false,
};

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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
