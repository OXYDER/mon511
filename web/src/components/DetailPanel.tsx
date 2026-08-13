import { useEffect, useState } from 'react';
import { api } from '../api';
import Lightbox from './Lightbox';
import PublicProfileModal from './PublicProfileModal';
import { pickName, timeAgo, statusPillClass } from '../i18n';

interface Props {
  reportId: string;
  onClose: () => void;
  onChanged: () => void;
  authenticated: boolean;
  onRequireAuth: () => void;
  lang: 'fr' | 'en';
  currentUserId: string | null;
}

export default function DetailPanel({ reportId, onClose, onChanged, authenticated, onRequireAuth, lang, currentUserId }: Props) {
  const [report, setReport] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showAuthorProfile, setShowAuthorProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    try {
      const [r, c] = await Promise.all([
        api.get<any>(`/reports/${reportId}`),
        api.get<any[]>(`/reports/${reportId}/comments`),
      ]);
      setReport(r);
      setComments(c);
      setEditDescription(r.description ?? '');
      setEditAddress(r.addressText ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signalement introuvable.');
    }
  }

  useEffect(() => {
    load();
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function saveEdit() {
    setEditSaving(true);
    try {
      await api.patch(`/reports/${reportId}`, { description: editDescription, addressText: editAddress });
      setEditing(false);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setEditSaving(false);
    }
  }

  async function confirm() {
    if (!authenticated) return onRequireAuth();
    try {
      await api.post(`/reports/${reportId}/confirm`);
      setFeedback('Confirmation enregistrée. Merci !');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  }

  async function suggestResolved() {
    if (!authenticated) return onRequireAuth();
    try {
      const result = await api.post<{ autoResolved: boolean }>(`/reports/${reportId}/suggest-resolution`, {});
      setFeedback(
        result.autoResolved
          ? 'Merci ! Le signalement est maintenant marqué résolu.'
          : "Suggestion envoyée à la modération et à l'auteur.",
      );
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  }

  async function flag() {
    if (!authenticated) return onRequireAuth();
    const reason = window.prompt('Motif (duplicate, inappropriate, wrong_location, spam, other) :', 'duplicate');
    if (!reason) return;
    try {
      await api.post(`/reports/${reportId}/flag`, { reason });
      setFeedback('Signalement transmis à la modération.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!authenticated) return onRequireAuth();
    if (!newComment.trim()) return;
    try {
      await api.post(`/reports/${reportId}/comments`, { message: newComment });
      setNewComment('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le commentaire.");
    }
  }

  return (
    <div className="detail-panel-float mobile-visible">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="detail-title" style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{report?.problemTypeIcon ?? '📍'}</span>
          <span>{report ? pickName(report.problemTypeNameFr, report.problemTypeNameEn, lang) : 'Signalement'}</span>
        </div>
        <button className="detail-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!report && !error && <div className="center-msg" style={{ padding: 20 }}>Chargement...</div>}

      {report && (
        <>
          <span className={`pill ${statusPillClass(report.status)}`} style={{ marginBottom: 10, display: 'inline-block' }}>
            {report.status === 'published_resolved' ? 'Résolu' : report.status === 'pending_moderation' ? '⏳ En attente d\'approbation' : 'Non résolu'}
          </span>
          {report.status === 'pending_moderation' && (
            <div className="error-banner" style={{ background: 'rgba(59,156,255,0.14)', borderColor: 'var(--official-blue)', color: 'var(--official-blue)' }}>
              Non visible pour les autres usagers pour l'instant. Tu recevras une notification une fois approuvé et publié.
            </div>
          )}

          {!editing && report.description && (
            <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 }}>{report.description}</div>
          )}

          {!editing && report.authorId && currentUserId === report.authorId && (
            <button
              className="btn-ghost"
              style={{ marginBottom: 12, fontSize: 12 }}
              onClick={() => setEditing(true)}
            >
              ✏️ {lang === 'fr' ? 'Modifier' : 'Edit'}
            </button>
          )}

          {editing && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 9, background: 'var(--panel-hover)' }}>
              <div className="field-group">
                <label className="field-label">{lang === 'fr' ? 'Description' : 'Description'}</label>
                <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">{lang === 'fr' ? 'Adresse' : 'Address'}</label>
                <input className="text-input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              </div>
              <div className="action-row">
                <button className="btn-primary" onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? (lang === 'fr' ? 'Enregistrement...' : 'Saving...') : (lang === 'fr' ? 'Enregistrer' : 'Save')}
                </button>
                <button className="btn-ghost" onClick={() => { setEditing(false); setEditDescription(report.description ?? ''); setEditAddress(report.addressText ?? ''); }}>
                  {lang === 'fr' ? 'Annuler' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {report.photos?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', flexShrink: 0 }}>
              {report.photos.map((p: any) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt="Photo du signalement"
                  onClick={() => setLightboxSrc(p.url)}
                  style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 9, flexShrink: 0, cursor: 'zoom-in' }}
                />
              ))}
            </div>
          )}

          {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

          <div className="detail-meta-row" style={{ marginBottom: 6 }}>
            <span>📍 {report.addressText ?? 'Position GPS'}</span>
            <span>🕓 {new Date(report.created_at).toLocaleDateString('fr-CA')} <span style={{ color: 'var(--text-muted)' }}>({timeAgo(report.created_at, lang)})</span></span>
          </div>
          <div
            style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 6, cursor: 'pointer' }}
            title={lang === 'fr' ? 'Cliquer pour copier' : 'Click to copy'}
            onClick={() => navigator.clipboard.writeText(report.id)}
          >
            🔗 ID : <code>{report.id}</code>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            👤 Signalé par{' '}
            {report.authorId ? (
              <span
                onClick={() => setShowAuthorProfile(true)}
                style={{ color: 'var(--accent-signal)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {report.authorDisplayName ?? 'Anonyme'}
              </span>
            ) : (
              'Anonyme'
            )}
          </div>
          {showAuthorProfile && report.authorId && (
            <PublicProfileModal userId={report.authorId} onClose={() => setShowAuthorProfile(false)} lang={lang} />
          )}
          {report.municipality_notified === 'yes' && (
            <div style={{ fontSize: 12, color: 'var(--status-resolved)', marginBottom: 4 }}>
              🏛️ Municipalité avisée{report.municipality_name ? ` — ${report.municipality_name}` : ''}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            👍 {report.confirmationsCount} confirmations
          </div>

          {feedback && <div className="success-banner">{feedback}</div>}

          <div className="action-row" style={{ margin: '14px 0' }}>
            <button className="btn-ghost" onClick={confirm}>👍 Présent</button>
            <button className="btn-ghost" onClick={suggestResolved}>✔ Résolu</button>
            <button className="btn-ghost btn-danger" onClick={flag}>🚩</button>
          </div>

          <div className="section-label" style={{ fontSize: 13 }}>Commentaires ({comments.length})</div>
          {comments.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun commentaire.</div>}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="comment-author">{c.authorEmail?.split('@')[0]}</div>
              {c.message}
            </div>
          ))}
          <form onSubmit={submitComment} className="comment-row">
            <input
              className="text-input"
              placeholder="Commenter..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button className="btn-ghost" type="submit">↵</button>
          </form>
        </>
      )}
    </div>
  );
}
