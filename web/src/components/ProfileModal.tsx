import { useEffect, useState } from 'react';
import { api, clearToken } from '../api';
import ToggleSwitch from './ToggleSwitch';
import CustomSelect from './CustomSelect';

interface Props {
  onClose: () => void;
  onLogout: () => void;
  onOpenMyReports: () => void;
}

const PRIVACY_LABELS: [string, string, string][] = [
  ['show_reputation', 'showReputation', 'Afficher ma réputation'],
  ['show_report_history', 'showReportHistory', 'Afficher mon historique de signalements'],
  ['show_region', 'showRegion', 'Afficher ma région'],
  ['show_real_name', 'showRealName', 'Afficher mon vrai nom'],
  ['show_online_status', 'showOnlineStatus', 'Afficher mon statut en ligne'],
];

export default function ProfileModal({ onClose, onLogout, onOpenMyReports }: Props) {
  const [me, setMe] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<'profile' | 'privacy' | 'security'>('profile');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordAwaitingCode, setPasswordAwaitingCode] = useState(false);
  const [passwordCode, setPasswordCode] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailAwaitingCode, setEmailAwaitingCode] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const updated = await api.post<any>('/users/me/avatar', formData);
      setMe(updated);
    } catch {
      // Silencieux — l'usager peut simplement réessayer.
    } finally {
      setUploadingAvatar(false);
    }
  }

  useEffect(() => {
    api.get<any>('/users/me').then((data) => {
      setMe(data);
      setFirstName(data.first_name ?? '');
      setLastName(data.last_name ?? '');
    }).catch((err) => {
      // Le jeton stocké existe (sinon la modale n'ouvrirait pas) mais
      // n'est plus valide (expiré, ou compte modifié depuis) — sans
      // catch ici, la modale restait bloquée sur "Chargement..." pour
      // toujours, avec le bouton de déconnexion emprisonné à l'intérieur
      // d'un {me && (...)} qui ne s'affichait donc jamais. Un jeton
      // invalide devrait de toute façon mener à une déconnexion propre,
      // pas à un blocage sans issue.
      if (err instanceof Error && err.message.toLowerCase().includes('unauthorized')) {
        clearToken();
        onLogout();
        return;
      }
      setLoadError(true);
    });
    // (Mes signalements affichés maintenant dans leur propre page dédiée.)
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

  async function requestPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordFeedback(null);
    setPasswordError(null);
    try {
      await api.patch('/users/me/password', { currentPassword, newPassword });
      setPasswordAwaitingCode(true);
      setPasswordFeedback('Code envoyé par courriel — entre-le ci-dessous pour confirmer le changement.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Impossible de changer le mot de passe.');
    }
  }

  async function confirmPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    try {
      await api.post('/users/me/password/confirm', { code: passwordCode });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordCode('');
      setPasswordAwaitingCode(false);
      setPasswordFeedback('Mot de passe changé.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Code invalide.');
    }
  }

  async function requestEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailFeedback(null);
    setEmailError(null);
    try {
      await api.patch('/users/me/email', { newEmail });
      setEmailAwaitingCode(true);
      setEmailFeedback(`Code envoyé à ${newEmail} — entre-le ci-dessous pour confirmer.`);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Impossible de changer l'adresse.");
    }
  }

  async function confirmEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    try {
      const updated = await api.post<any>('/users/me/email/confirm', { newEmail, code: emailCode });
      setMe((prev: any) => ({ ...prev, email: updated.email ?? newEmail }));
      setEmailAwaitingCode(false);
      setEmailCode('');
      setNewEmail('');
      setEmailFeedback('Adresse courriel changée.');
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Code invalide.');
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
          {!me && !loadError && <div className="center-msg">Chargement...</div>}
          {loadError && (
            <div className="center-msg" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <span>Impossible de charger ton profil.</span>
              <button className="btn-ghost" onClick={() => { clearToken(); onLogout(); }}>
                Se déconnecter
              </button>
            </div>
          )}
          {me && (
            <>
              <div className="profile-head">
                <label style={{ position: 'relative', cursor: 'pointer' }} title="Changer la photo de profil">
                  {me.avatar_url ? (
                    <img src={me.avatar_url} alt="" className="avatar-lg" style={{ objectFit: 'cover' }} />
                  ) : (
                    <div className="avatar-lg">{initials}</div>
                  )}
                  <div style={{
                    position: 'absolute', bottom: -2, right: -2, background: 'var(--accent-signal)',
                    borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, border: '2px solid var(--panel-solid)',
                  }}>
                    {uploadingAvatar ? '…' : '✏️'}
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    disabled={uploadingAvatar}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
                  />
                </label>
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
                    <label className="field-label">Courriel actuel</label>
                    <input className="text-input" value={me.email} disabled style={{ opacity: 0.6 }} />
                  </div>
                  <button className="btn-primary" type="submit">Enregistrer</button>
                </form>
              )}

              {tab === 'profile' && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--panel-border)' }}>
                  {emailFeedback && <div className="success-banner">{emailFeedback}</div>}
                  {emailError && <div className="error-banner">{emailError}</div>}
                  {!emailAwaitingCode ? (
                    <form onSubmit={requestEmail}>
                      <div className="field-group">
                        <label className="field-label">Changer d'adresse courriel</label>
                        <input className="text-input" type="email" required placeholder="nouvelle-adresse@courriel.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                      </div>
                      <button className="btn-ghost" type="submit">Envoyer un code de confirmation</button>
                    </form>
                  ) : (
                    <form onSubmit={confirmEmail}>
                      <div className="field-group">
                        <label className="field-label">Code reçu à {newEmail}</label>
                        <input
                          className="text-input"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                          style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
                        />
                      </div>
                      <button className="btn-primary" type="submit">Confirmer le changement</button>
                    </form>
                  )}
                </div>
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
                    <CustomSelect
                      value={me.privacy_settings.last_name_display ?? 'hidden'}
                      onChange={(v) => setLastNameDisplay(v as any)}
                      options={[
                        { value: 'hidden', label: 'Ne pas afficher' },
                        {
                          value: 'initial',
                          label: `Première lettre seulement${me.last_name ? ` (ex. « ${me.first_name || 'Toi'} ${me.last_name[0].toUpperCase()}. »)` : ''}`,
                        },
                        {
                          value: 'full',
                          label: `Nom complet${me.last_name ? ` (ex. « ${me.first_name || 'Toi'} ${me.last_name} »)` : ''}`,
                        },
                      ]}
                    />
                  </div>
                </>
              )}

              {tab === 'security' && !passwordAwaitingCode && (
                <form onSubmit={requestPassword}>
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
                  <button className="btn-primary" type="submit">Envoyer un code de confirmation</button>
                </form>
              )}
              {tab === 'security' && passwordAwaitingCode && (
                <form onSubmit={confirmPassword}>
                  <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>Confirmer le changement</div>
                  {passwordFeedback && <div className="success-banner">{passwordFeedback}</div>}
                  {passwordError && <div className="error-banner">{passwordError}</div>}
                  <div className="field-group">
                    <label className="field-label">Code reçu par courriel</label>
                    <input
                      className="text-input"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={passwordCode}
                      onChange={(e) => setPasswordCode(e.target.value.replace(/\D/g, ''))}
                      style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
                    />
                  </div>
                  <button className="btn-primary" type="submit">Confirmer</button>
                </form>
              )}

              <button
                className="btn-primary"
                style={{ width: '100%', marginTop: 20 }}
                onClick={onOpenMyReports}
              >
                📋 Mes signalements
              </button>

              <button
                className="btn-ghost btn-danger"
                style={{ width: '100%', marginTop: 10 }}
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
