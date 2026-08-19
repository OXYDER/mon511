import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

/** Connexion WebSocket partagée pour toute l'application — une seule
 * connexion, réutilisée par tous les composants qui en ont besoin
 * (messagerie pour l'instant, potentiellement d'autres plus tard). Se
 * reconnecte automatiquement (comportement par défaut de socket.io) si
 * la connexion tombe — utile sur mobile en particulier. */
export function getSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;

  if (!socket) {
    socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
  } else if (socket.auth && (socket.auth as any).token !== token) {
    // Le jeton a changé (nouvelle connexion, ou reconnexion après une
    // déconnexion) — reconnecte avec le bon jeton plutôt que de garder
    // une connexion authentifiée pour le mauvais compte.
    socket.auth = { token };
    socket.disconnect().connect();
  }

  return socket;
}

/** Ferme la connexion — appelé à la déconnexion de l'usager, pour ne pas
 * garder une connexion WebSocket authentifiée pour un compte qui vient
 * de se déconnecter. */
export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
