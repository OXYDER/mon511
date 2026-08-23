import { useState } from 'react';
import { api, setToken } from '../api';
import { searchCities, GeocodingResult } from '../geocoding';

interface Props {
  onClose: () => void;
  onAuthenticated: () => void;
  initialMode?: 'login' | 'register';
  lang?: 'fr' | 'en';
}

type View = 'login' | 'register' | 'verify' | 'forgot-email' | 'forgot-reset';

export default function AuthModal({ onClose, onAuthenticated, initialMode = 'login', lang = 'fr' }: Props) {
  const [view, setView] = useState<View>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodingResult[]>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onAddressChange(value: string) {
    setAddressText(value);
    setShowAddressDropdown(true);
    if (value.trim().length < 3) { setAddressSuggestions([]); return; }
    const results = await searchCities(value, 5);
    setAddressSuggestions(results);
  }

  function selectAddress(s: GeocodingResult) {
    setAddressText(s.name);
    setShowAddressDropdown(false);
    setAddressSuggestions([]);
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (view === 'login') {
        const result = await api.post<{ accessToken: string }>('/auth/login', { email, password });
        setToken(result.accessToken);
        onAuthenticated();
      } else {
        await api.post('/auth/register', { email, password, firstName, lastName, addressText });
        setInfo(null);
        setView('verify');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue.';
      setError(message);
      if (view === 'login' && message.toLowerCase().includes('vérifié')) {
        setView('verify');
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{ accessToken: string }>('/auth/verify-email', { email, code });
      setToken(result.accessToken);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide.');
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setError(null);
    setInfo(null);
    try {
      await api.post('/auth/resend-signup-code', { email });
      setInfo('Nouveau code envoyé — vérifie ton courriel.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function submitForgotEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setInfo("Si ce courriel correspond à un compte, un code a été envoyé.");
      setView('forgot-reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, code, newPassword });
      setInfo('Mot de passe changé — tu peux te connecter.');
      setPassword('');
      setView('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<View, string> = {
    login: 'Connexion',
    register: 'Créer un compte',
    verify: 'Vérifie ton courriel',
    'forgot-email': 'Mot de passe oublié',
    'forgot-reset': 'Nouveau mot de passe',
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 420 }}>
        <div className="modal-head">
          <div className="modal-title">{titles[view]}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {(view === 'login' || view === 'register') && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <img
                  src={lang === 'en' ? '/brand/logo-full-en.png' : '/brand/logo-full.png'}
                  alt={lang === 'en' ? 'my511.ca' : 'mon511.ca'}
                  style={{ width: '100%', maxWidth: 260 }}
                />
              </div>
              <div className="tabs">
                <button className={`tab-item ${view === 'login' ? 'active' : ''}`} onClick={() => { setView('login'); setError(null); }}>
                  Connexion
                </button>
                <button className={`tab-item ${view === 'register' ? 'active' : ''}`} onClick={() => { setView('register'); setError(null); }}>
                  Créer un compte
                </button>
              </div>
            </>
          )}

          {error && <div className="error-banner">{error}</div>}
          {info && <div className="success-banner">{info}</div>}

          {(view === 'login' || view === 'register') && (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
                {view === 'login'
                  ? 'Connecte-toi pour signaler, confirmer ou commenter.'
                  : 'Rejoins la communauté et aide à garder les routes sécuritaires.'}
              </p>
              <form onSubmit={submitAuth}>
                {view === 'register' && (
                  <div className="field-group">
                    <label className="field-label">Prénom</label>
                    <input className="text-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                )}
                {view === 'register' && (
                  <div className="field-group">
                    <label className="field-label">Nom</label>
                    <input className="text-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                )}
                {view === 'register' && (
                  <div className="field-group" style={{ position: 'relative' }}>
                    <label className="field-label">Adresse</label>
                    <input
                      className="text-input"
                      value={addressText}
                      onChange={(e) => onAddressChange(e.target.value)}
                      onFocus={() => setShowAddressDropdown(true)}
                      onBlur={() => setTimeout(() => setShowAddressDropdown(false), 150)}
                      placeholder="Commence à taper ton adresse..."
                      autoComplete="off"
                    />
                    {showAddressDropdown && addressSuggestions.length > 0 && (
                      <div className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0 }}>
                        {addressSuggestions.map((s) => (
                          <div key={s.name} className="search-dropdown-item" onClick={() => selectAddress(s)}>
                            📍 {s.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="field-group">
                  <label className="field-label">Courriel</label>
                  <input
                    className="text-input"
                    type="email"
                    required
                    placeholder="prenom.nom@courriel.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Mot de passe</label>
                  <input
                    className="text-input"
                    type="password"
                    required
                    minLength={view === 'register' ? 10 : undefined}
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {view === 'register' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Minimum 10 caractères.</div>
                  )}
                </div>
                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Un instant...' : view === 'login' ? 'Se connecter' : 'Créer mon compte'}
                </button>
              </form>
              {view === 'login' && (
                <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { setView('forgot-email'); setError(null); setInfo(null); }}>
                  Mot de passe oublié ?
                </button>
              )}
            </>
          )}

          {view === 'verify' && (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
                On a envoyé un code à <strong>{email}</strong>. Entre-le ici pour activer ton compte.
              </p>
              <form onSubmit={submitVerify}>
                <div className="field-group">
                  <label className="field-label">Code à 6 chiffres</label>
                  <input
                    className="text-input"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
                  />
                </div>
                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Un instant...' : 'Confirmer'}
                </button>
              </form>
              <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={resendCode}>
                Renvoyer le code
              </button>
            </>
          )}

          {view === 'forgot-email' && (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
                Entre ton courriel — si un compte y est associé, tu recevras un code pour choisir un nouveau mot de passe.
              </p>
              <form onSubmit={submitForgotEmail}>
                <div className="field-group">
                  <label className="field-label">Courriel</label>
                  <input className="text-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Un instant...' : 'Envoyer le code'}
                </button>
              </form>
              <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setView('login')}>
                ← Retour à la connexion
              </button>
            </>
          )}

          {view === 'forgot-reset' && (
            <form onSubmit={submitForgotReset}>
              <div className="field-group">
                <label className="field-label">Code reçu par courriel</label>
                <input
                  className="text-input"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center' }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Nouveau mot de passe</label>
                <input className="text-input" type="password" required minLength={10} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Un instant...' : 'Changer le mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
