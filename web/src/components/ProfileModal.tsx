import { useEffect, useState } from 'react';
import { api, clearToken } from '../api';
import ToggleSwitch from './ToggleSwitch';

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

const PRIVACY_LABELS: [string, string, string][] = [
  ['show_reputation', 'showReputation', 'Afficher ma réputation'],
  ['show_report_history', 'showReportHistory', 'Afficher mon historique de signalements'],
  ['show_region', 'showRegion', 'Afficher ma région'],
  ['show_real_name', 'showRealName', 'Afficher mon vrai nom'],
];

export default function ProfileModal({ onClose, onLogout }: Props) {
  const [me, setMe] = useState<any>(null);
  const [myReports, setMyReports] = useState<any[]>([]);
  const [tab, setTab] = useState<'profile' | 'privacy' | 'security'>('profile');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any>('/users/me').then((data) => {
      setMe(data);
      setFirstName(data.first_name ?? '');
      setLastName(data.last_name ?? '');
    });
    api.get<any[]>('/users/me/reports').then(setMyReports);
  }, []);

  async function togglePrivacy(snakeKey: string, camelKey: string, current: boolean) {
    const body: Record<string, boolean> = { [camelKey]: !current };
    const updated = await api.patch<any>('/users/me/privacy', body);
    setMe((prev: any) => ({ ...prev, privacy_settings: updated }));
  }

  async function setLastNameDisplay(mode: 'full' | 'initial' | 'hidden') {
    const updated = await api.patch<any>('/users/me/privacy', { lastNameDisplay: mode });
    setMe((prev: any) => ({ ...prev, privacy_settings: updated }));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileFeedback(null);
    const updated = await api.patch<any>('/users/me/profile', { firstName, lastName });
    setMe(updated);
    setProfileFeedback('Profil mis à jour.');
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordFeedback(null);
    setPasswordError(null);
    try {
      await api.patch('/users/me/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordFeedback('Mot de passe changé.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Impossible de changer le mot de passe.');
    }
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

              <div className="tabs" style={{ marginBottom: 20 }}>
                <button className={`tab-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profil</button>
                <button className={`tab-item ${tab === 'privacy' ? 'active' : ''}`} onClick={() => setTab('privacy')}>Confidentialité</button>
                <button className={`tab-item ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>Sécurité</button>
              </div>

              {tab === 'profile' && (
                <form onSubmit={saveProfile}>
                  {profileFeedback && <div className="success-banner">{profileFeedback}</div>}
                  <div className="field-group">
                    <label className="field-label">Prénom</label>
                    <input className="text-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Nom de famille</label>
                    <input className="text-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Courriel</label>
                    <input className="text-input" value={me.email} disabled style={{ opacity: 0.6 }} />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                      Le courriel ne peut pas être changé pour l'instant.
                    </div>
                  </div>
                  <button className="btn-primary" type="submit">Enregistrer</button>
                </form>
              )}

              {tab === 'privacy' && (
                <>
                  <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>Confidentialité</div>
                  {PRIVACY_LABELS.map(([snakeKey, camelKey, label]) => (
                    <div key={snakeKey} className="privacy-row">
                      <span>{label}</span>
                      <ToggleSwitch on={me.privacy_settings[snakeKey]} onToggle={() => togglePrivacy(snakeKey, camelKey, me.privacy_settings[snakeKey])} />
                    </div>
                  ))}

                  <div className="field-group" style={{ marginTop: 16 }}>
                    <label className="field-label">Affichage de mon nom de famille</label>
                    <select value={me.privacy_settings.last_name_display ?? 'hidden'} onChange={(e) => setLastNameDisplay(e.target.value as any)}>
                      <option value="hidden">Ne pas afficher</option>
                      <option value="initial">Première lettre seulement (ex. « Benoit T. »)</option>
                      <option value="full">Nom complet</option>
                    </select>
                  </div>
                </>
              )}

              {tab === 'security' && (
                <form onSubmit={savePassword}>
                  <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>Changer le mot de passe</div>
                  {passwordFeedback && <div className="success-banner">{passwordFeedback}</div>}
                  {passwordError && <div className="error-banner">{passwordError}</div>}
                  <div className="field-group">
                    <label className="field-label">Mot de passe actuel</label>
                    <input className="text-input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Nouveau mot de passe</label>
                    <input className="text-input" type="password" required minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Minimum 10 caractères.</div>
                  </div>
                  <button className="btn-primary" type="submit">Changer le mot de passe</button>
                </form>
              )}

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
                    <div className="rc-meta">{r.addressText ?? 'GPS'} · {new Date(r.created_at).toLocaleDateString('fr-CA')}</div>
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
