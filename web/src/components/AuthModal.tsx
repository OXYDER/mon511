import { useState } from 'react';
import { api, setToken } from '../api';

interface Props {
  onClose: () => void;
  onAuthenticated: () => void;
  initialMode?: 'login' | 'register';
}

export default function AuthModal({ onClose, onAuthenticated, initialMode = 'login' }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, firstName };
      const result = await api.post<{ accessToken: string }>(path, body);
      setToken(result.accessToken);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 420 }}>
        <div className="modal-head">
          <div className="modal-title">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="tabs">
            <button className={`tab-item ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
              Connexion
            </button>
            <button className={`tab-item ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
              Créer un compte
            </button>
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
            {mode === 'login'
              ? 'Connecte-toi pour signaler, confirmer ou commenter.'
              : 'Rejoins la communauté et aide à garder les routes sécuritaires.'}
          </p>

          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="field-group">
                <label className="field-label">Prénom</label>
                <input className="text-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
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
                minLength={mode === 'register' ? 10 : undefined}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'register' && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Minimum 10 caractères.</div>
              )}
            </div>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Un instant...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
