import { useState } from 'react';

interface Props {
  lang: 'fr' | 'en';
  onDecision: (accepted: boolean) => void;
}

/** Bannière de consentement aux témoins de connexion (cookies) — le choix
 * de l'usager est mémorisé localement (voir cookieConsent.ts) et ne
 * réapparaît pas tant qu'il n'a pas été effacé manuellement (nettoyage du
 * navigateur). Explique honnêtement ce qui est réellement utilisé :
 * mon511 lui-même stocke le jeton de connexion dans le stockage local du
 * navigateur (pas un vrai témoin), mais des services tiers dont on
 * dépend (Cloudflare, pour la protection et les statistiques du site)
 * peuvent déposer de vrais témoins. */
export default function CookieConsentBanner({ lang, onDecision }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const fr = lang === 'fr';

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 550,
      background: 'var(--panel-solid)', borderTop: '1px solid var(--panel-border)',
      boxShadow: '0 -8px 24px rgba(0,0,0,0.3)', padding: '16px 18px',
      paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
          {fr
            ? "🍪 mon511 utilise le stockage local de ton navigateur pour te garder connecté, et certains services dont on dépend (comme Cloudflare, pour la sécurité et la performance du site) peuvent déposer des témoins de connexion."
            : '🍪 mon511 uses your browser\'s local storage to keep you signed in, and some services we rely on (like Cloudflare, for site security and performance) may set cookies.'}
        </p>

        {showDetails && (
          <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)' }}>
            <p style={{ marginBottom: 8 }}>
              <strong style={{ color: 'var(--text-body)' }}>{fr ? 'Essentiels (toujours actifs)' : 'Essential (always on)'}</strong><br />
              {fr
                ? "Ton jeton de connexion (pour rester identifié) est gardé dans le stockage local de ton navigateur, pas dans un témoin traditionnel — mais le principe est le même : sans lui, tu devrais te reconnecter à chaque visite."
                : 'Your login token (to keep you signed in) is kept in your browser\'s local storage, not a traditional cookie — but the principle is the same: without it, you\'d need to sign in again on every visit.'}
            </p>
            <p>
              <strong style={{ color: 'var(--text-body)' }}>{fr ? 'Tiers (Cloudflare)' : 'Third-party (Cloudflare)'}</strong><br />
              {fr
                ? "mon511 passe par Cloudflare pour se protéger contre les attaques et accélérer le site. Cloudflare peut déposer ses propres témoins à cette fin — mon511 n'affiche aucune publicité et ne vend jamais tes données."
                : 'mon511 uses Cloudflare to protect against attacks and speed up the site. Cloudflare may set its own cookies for this purpose — mon511 shows no ads and never sells your data.'}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-primary" style={{ fontSize: 12.5 }} onClick={() => onDecision(true)}>
            {fr ? 'Accepter' : 'Accept'}
          </button>
          <button className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => onDecision(false)}>
            {fr ? 'Refuser les non essentiels' : 'Decline non-essential'}
          </button>
          <button
            className="btn-ghost"
            style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? (fr ? 'Masquer les détails' : 'Hide details') : (fr ? 'En savoir plus' : 'Learn more')}
          </button>
        </div>
      </div>
    </div>
  );
}
