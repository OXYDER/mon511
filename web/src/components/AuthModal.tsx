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
  const fr = lang === 'fr';
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
      const message = err instanceof Error ? err.message : (fr ? 'Une erreur est survenue.' : 'An error occurred.');
      setError(message);
      // Ce test cherche un mot précis dans le message d'erreur RENVOYÉ PAR
      // LE SERVEUR (toujours en français pour l'instant, peu importe la
      // langue de l'interface — la localisation des messages d'erreur du
      // serveur est un chantier séparé, non couvert ici) pour détecter le
      // cas « compte pas encore vérifié » et rediriger vers l'écran de
      // vérification.
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
      setError(err instanceof Error ? err.message : (fr ? 'Code invalide.' : 'Invalid code.'));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setError(null);
    setInfo(null);
    try {
      await api.post('/auth/resend-signup-code', { email });
      setInfo(fr ? 'Nouveau code envoyé — vérifie ton courriel.' : 'New code sent — check your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : (fr ? 'Erreur.' : 'Error.'));
    }
  }

  async function submitForgotEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setInfo(fr ? "Si ce courriel correspond à un compte, un code a été envoyé." : 'If this email matches an account, a code has been sent.');
      setView('forgot-reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : (fr ? 'Erreur.' : 'Error.'));
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
      setInfo(fr ? 'Mot de passe changé — tu peux te connecter.' : 'Password changed — you can now log in.');
      setPassword('');
      setView('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : (fr ? 'Erreur.' : 'Error.'));
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<View, string> = fr
    ? {
        login: 'Connexion',
        register: 'Créer un compte',
        verify: 'Vérifie ton courriel',
        'forgot-email': 'Mot de passe oublié',
        'forgot-reset': 'Nouveau mot de passe',
      }
    : {
        login: 'Log in',
        register: 'Create an account',
        verify: 'Verify your email',
        'forgot-email': 'Forgot password',
        'forgot-reset': 'New password',
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
                  {fr ? 'Connexion' : 'Log in'}
                </button>
                <button className={`tab-item ${view === 'register' ? 'active' : ''}`} onClick={() => { setView('register'); setError(null); }}>
                  {fr ? 'Créer un compte' : 'Create an account'}
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
                  ? (fr ? 'Connecte-toi pour signaler, confirmer ou commenter.' : 'Log in to report, confirm, or comment.')
                  : (fr ? 'Rejoins la communauté et aide à garder les routes sécuritaires.' : 'Join the community and help keep roads safe.')}
              </p>
              <form onSubmit={submitAuth}>
                {view === 'register' && (
                  <div className="field-group">
                    <label className="field-label">{fr ? 'Prénom' : 'First name'}</label>
                    <input className="text-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                )}
                {view === 'register' && (
                  <div className="field-group">
                    <label className="field-label">{fr ? 'Nom' : 'Last name'}</label>
                    <input className="text-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                )}
                {view === 'register' && (
                  <div className="field-group" style={{ position: 'relative' }}>
                    <label className="field-label">{fr ? 'Adresse' : 'Address'}</label>
                    <input
                      className="text-input"
                      value={addressText}
                      onChange={(e) => onAddressChange(e.target.value)}
                      onFocus={() => setShowAddressDropdown(true)}
                      onBlur={() => setTimeout(() => setShowAddressDropdown(false), 150)}
                      placeholder={fr ? 'Commence à taper ton adresse...' : 'Start typing your address...'}
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
                  <label className="field-label">{fr ? 'Courriel' : 'Email'}</label>
                  <input
                    className="text-input"
                    type="email"
                    required
                    placeholder={fr ? 'prenom.nom@courriel.com' : 'name@email.com'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{fr ? 'Mot de passe' : 'Password'}</label>
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
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                      {fr ? 'Minimum 10 caractères.' : 'Minimum 10 characters.'}
                    </div>
                  )}
                </div>
                <button className="btn-primary" type="submit" disabled={loading}>
                  {loading ? (fr ? 'Un instant...' : 'One moment...') : view === 'login' ? (fr ? 'Se connecter' : 'Log in') : (fr ? 'Créer mon compte' : 'Create my account')}
                </button>
              </form>
              {view === 'login' && (
                <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { setView('forgot-email'); setError(null); setInfo(null); }}>
                  {fr ? 'Mot de passe oublié ?' : 'Forgot your password?'}
                </button>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
