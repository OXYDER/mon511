import { useEffect, useState } from 'react';
import { api, clearToken } from '../api';

interface Props {
  onLogout: () => void;
}

export default function ProfilePage({ onLogout }: Props) {
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

  if (!me) return <div className="content"><div className="center-msg">Chargement...</div></div>;

  return (
    <div className="content">
      <div className="detail-title">{me.first_name || me.email.split('@')[0]}</div>
      <div className="rc-meta" style={{ marginBottom: 20 }}>Réputation : {me.reputation_score} · Membre depuis {new Date(me.created_at).toLocaleDateString('fr-CA')}</div>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 10 }}>Confidentialité</div>
      {[
        ['show_reputation', 'Afficher ma réputation'],
        ['show_report_history', 'Afficher mon historique de signalements'],
        ['show_region', 'Afficher ma région'],
        ['show_real_name', 'Afficher mon vrai nom'],
      ].map(([key, label]) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 13 }}>
          <span>{label}</span>
          <button className="btn-ghost" onClick={() => togglePrivacy(key, me.privacy_settings[key])}>
            {me.privacy_settings[key] ? 'Activé' : 'Désactivé'}
          </button>
        </div>
      ))}

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, margin: '20px 0 10px' }}>
        Mes signalements ({myReports.length})
      </div>
      {myReports.map((r) => (
        <div key={r.id} className="report-card">
          <div className="rc-icon">{r.problemTypeIcon ?? '📍'}</div>
          <div className="rc-body">
            <div className="rc-title">{r.problemTypeNameFr}</div>
            <div className="rc-meta">{new Date(r.created_at).toLocaleDateString('fr-CA')}</div>
          </div>
          <span className={`pill ${r.status === 'published_resolved' ? 'resolved' : 'unresolved'}`}>
            {r.status}
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
    </div>
  );
}
