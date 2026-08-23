import { useEffect, useState } from 'react';
import { api } from '../api';
import { timeAgo } from '../i18n';

interface Props {
  regionId: string;
  lang: 'fr' | 'en';
  onClose: () => void;
  onViewProfile: (userId: string) => void;
  onViewReport: (reportId: string) => void;
}

const CATEGORY_LABELS: Record<string, { icon: string; fr: string; en: string }> = {
  road_conditions: { icon: '🛣️', fr: 'État des routes', en: 'Road conditions' },
  community: { icon: '🤝', fr: 'Vie communautaire', en: 'Community life' },
  general: { icon: '💬', fr: 'Général', en: 'General' },
};

export default function MunicipalityPage({ regionId, lang, onClose, onViewProfile, onViewReport }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>(`/municipal-portal/public/${regionId}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur de chargement.'))
      .finally(() => setLoading(false));
  }, [regionId]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 480, maxWidth: '95vw', display: 'flex', flexDirection: 'column', height: '86vh' }}>
        <div className="modal-head">
          <div className="modal-title">{loading ? (fr ? 'Chargement...' : 'Loading...') : data?.regionName}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {error && <div className="error-banner">{error}</div>}
          {loading && <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>}

          {data && (
            <>
              {!data.hasManager && (
                <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 12, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
                  {fr
                    ? "Cette municipalité n'a pas encore de gestionnaire attitré. Un employé municipal peut réclamer cette page depuis le portail municipal."
                    : "This municipality doesn't have a dedicated manager yet. A municipal employee can claim this page from the municipal portal."}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <div style={{ flex: 1, background: 'var(--panel-hover)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-signal)' }}>{data.stats.unresolved}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fr ? 'Non résolus' : 'Unresolved'}</div>
                </div>
                <div style={{ flex: 1, background: 'var(--panel-hover)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#3BD16F' }}>{data.stats.resolved}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fr ? 'Résolus' : 'Resolved'}</div>
                </div>
              </div>

              <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Fil de la municipalité' : 'Municipality feed'}</div>

              {data.posts.length === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {fr ? 'Aucune publication publique pour le moment.' : 'No public posts yet.'}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.posts.map((post: any) => {
                  const cat = CATEGORY_LABELS[post.category];
                  return (
                    <div key={post.id} style={{ background: 'var(--panel-hover)', borderRadius: 12, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div className="rc-icon-hex" style={{ width: 26, height: 26, fontSize: 11, cursor: 'pointer' }} onClick={() => onViewProfile(post.author_id)}>
                          {post.authorAvatarUrl ? (
                            <img src={post.authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                          ) : (
                            (post.authorDisplayName?.[0] ?? '?').toUpperCase()
                          )}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={() => onViewProfile(post.author_id)}>
                          {post.authorDisplayName}
                        </div>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{timeAgo(post.created_at, lang)}</span>
                      </div>
                      {cat && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{cat.icon} {fr ? cat.fr : cat.en}</span>}
                      {post.body && <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '6px 0 0' }}>{post.body}</p>}
                      {post.reportId && (
                        <button className="btn-ghost" style={{ fontSize: 11, marginTop: 8 }} onClick={() => onViewReport(post.reportId)}>
                          {fr ? 'Voir le signalement →' : 'View report →'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
