import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  userId: string;
  onClose: () => void;
}

export default function PublicProfileModal({ userId, onClose }: Props) {
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any>(`/users/${userId}`).then(setProfile).catch((err) => setError(err instanceof Error ? err.message : 'Introuvable.'));
  }, [userId]);

  return (
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
                <div className="avatar-lg">{(profile.displayName?.[0] ?? '?').toUpperCase()}</div>
                <div>
                  <div className="profile-name">{profile.displayName}</div>
                  <div className="profile-meta">
                    Membre depuis {new Date(profile.memberSince).toLocaleDateString('fr-CA')}
                    {profile.regionName && ` · ${profile.regionName}`}
                  </div>
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
                        <div className="rc-title">{r.problemTypeNameFr}</div>
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
    </div>
  );
}
