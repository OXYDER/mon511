import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { pickName } from '../i18n';

interface Props {
  userId: string;
  onClose: () => void;
  lang: 'fr' | 'en';
  currentUserId?: string | null;
  onStartConversation?: (userId: string) => void;
}

export default function PublicProfileModal({ userId, onClose, lang, currentUserId, onStartConversation }: Props) {
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any>(`/users/${userId}`).then(setProfile).catch((err) => setError(err instanceof Error ? err.message : 'Introuvable.'));
  }, [userId]);

  // Rendu via un portail (document.body) plutôt qu'à même l'arborescence
  // du composant appelant — sans ça, un ancêtre avec backdrop-filter (ex.
  // le panneau de détail d'un signalement) crée un nouveau contexte de
  // positionnement CSS pour tout élément position:fixed imbriqué dedans,
  // ce qui coinçait cette modale dans les limites du petit panneau
  // plutôt que de couvrir l'écran au complet.
  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 380 }}>
        <div className="modal-head">
          <div className="modal-title">Profil</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}
          {!profile && !error && <div className="center-msg">Chargement...</div>}
          {profile && (
            <>
              <div className="profile-head">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="avatar-lg" style={{ objectFit: 'cover' }} />
                ) : (
                  <div className="avatar-lg">{(profile.displayName?.[0] ?? '?').toUpperCase()}</div>
                )}
                <div>
                  <div className="profile-name">{profile.displayName}</div>
                  <div className="profile-meta">
                    Membre depuis {new Date(profile.memberSince).toLocaleDateString('fr-CA')}
                    {profile.regionName && ` · ${profile.regionName}`}
                  </div>
                  {onStartConversation && currentUserId && currentUserId !== userId && (
                    <button
                      className="btn-ghost"
                      style={{ marginTop: 8, fontSize: 11.5 }}
                      onClick={() => { onStartConversation(userId); onClose(); }}
                    >
                      💬 {lang === 'fr' ? 'Envoyer un message' : 'Send a message'}
                    </button>
                  )}
                </div>
              </div>

              {profile.reputationScore !== null && (
                <div className="privacy-row">
                  <span>Réputation</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{profile.reputationScore}</span>
                </div>
              )}

              {profile.showReportHistory ? (
                <>
                  <div className="section-label">Signalements ({profile.reports.length})</div>
                  {profile.reports.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucun signalement publié.</div>
                  )}
                  {profile.reports.map((r: any) => (
                    <div key={r.id} className="report-card" style={{ cursor: 'default' }}>
                      <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                        {r.problemTypeIcon ?? '📍'}
                      </div>
                      <div className="rc-body">
                        <div className="rc-title">{pickName(r.problemTypeNameFr, r.problemTypeNameEn, lang)}</div>
                        <div className="rc-meta">{new Date(r.created_at).toLocaleDateString('fr-CA')}</div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16 }}>
                  Cette personne a choisi de ne pas afficher son historique de signalements.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
