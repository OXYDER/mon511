import { useState } from 'react';
import { api, setToken } from '../api';

interface Props {
  onAuthenticated: () => void;
}

export default function AuthPage({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
    <div className="content" style={{ display: 'flex', alignItems: 'center', minHeight: 'calc(100vh - 130px)' }}>
      <div style={{ width: '100%', background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 16, boxShadow: 'var(--shadow-panel)', padding: '26px 22px' }}>
        <div className="tabs">
          <button className={`tab-item ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            Connexion
          </button>
          <button className={`tab-item ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            Créer un compte
          </button>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, marginBottom: 4 }}>
          {mode === 'login' ? 'Content de vous revoir' : 'Créer un compte'}
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
          {mode === 'login'
            ? 'Connectez-vous pour signaler et suivre les incidents près de chez vous.'
            : 'Rejoignez la communauté et aidez à garder les routes sécuritaires.'}
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
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                Minimum 10 caractères.
              </div>
            )}
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Un instant...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
      </div>
    </div>
  );
}
