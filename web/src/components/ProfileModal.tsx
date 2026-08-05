import { useEffect, useState } from 'react';
import { api, clearToken } from '../api';

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

const PRIVACY_LABELS: [string, string][] = [
  ['show_reputation', 'Afficher ma réputation'],
  ['show_report_history', 'Afficher mon historique de signalements'],
  ['show_region', 'Afficher ma région'],
  ['show_real_name', 'Afficher mon vrai nom'],
];

export default function ProfileModal({ onClose, onLogout }: Props) {
  const [me, setMe] = useState<any>(null);
  const [myReports, setMyReports] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/users/me').then(setMe);
    api.get<any[]>('/users/me/reports').then(setMyReports);
  }, []);

  async function togglePrivacy(key: string, current: boolean) {
    const body: Record<string, boolean> = {};
    body[key] = !current;
    const updated = await api.patch<any>('/users/me/privacy', body);
    setMe((prev: any) => ({ ...prev, privacy_settings: updated }));
  }

  const initials = me ? (me.first_name?.[0] ?? me.email[0]).toUpperCase() : '?';

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-head">
          <div className="modal-title">Mon profil</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!me && <div className="center-msg">Chargement...</div>}
          {me && (
            <>
              <div className="profile-head">
                <div className="avatar-lg">{initials}</div>
                <div>
                  <div className="profile-name">{me.first_name || me.email.split('@')[0]}</div>
                  <div className="profile-meta">
                    Réputation : {me.reputation_score} · Membre depuis {new Date(me.created_at).toLocaleDateString('fr-CA')}
                  </div>
                </div>
              </div>

              <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>Confidentialité</div>
              {PRIVACY_LABELS.map(([key, label]) => (
                <div key={key} className="privacy-row">
                  <span>{label}</span>
                  <button className="btn-ghost" onClick={() => togglePrivacy(key, me.privacy_settings[key])}>
                    {me.privacy_settings[key] ? 'Activé' : 'Désactivé'}
                  </button>
                </div>
              ))}

              <div className="section-label">Mes signalements ({myReports.length})</div>
              {myReports.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Tu n'as encore fait aucun signalement.</div>
              )}
              {myReports.map((r) => (
                <div key={r.id} className="report-card" style={{ cursor: 'default' }}>
                  <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                    {r.problemTypeIcon ?? '📍'}
                  </div>
                  <div className="rc-body">
                    <div className="rc-title">{r.problemTypeNameFr}</div>
                    <div className="rc-meta">{new Date(r.created_at).toLocaleDateString('fr-CA')}</div>
                  </div>
                  <span className={`pill ${r.status === 'published_resolved' ? 'resolved' : 'unresolved'}`}>
                    {r.status === 'published_resolved' ? 'Résolu' : r.status === 'pending_moderation' ? 'En modération' : 'Non résolu'}
                  </span>
                </div>
              ))}

              <button
                className="btn-ghost btn-danger"
                style={{ width: '100%', marginTop: 20 }}
                onClick={() => { clearToken(); onLogout(); }}
              >
                Se déconnecter
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
