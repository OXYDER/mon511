import { useEffect, useState } from 'react';
import { api } from '../api';
import Lightbox from './Lightbox';
import PublicProfileModal from './PublicProfileModal';
import { pickName, timeAgo, statusPillClass } from '../i18n';
import TranslatableText from './TranslatableText';
import Tooltip from './Tooltip';

interface Props {
  reportId: string;
  onClose: () => void;
  onChanged: () => void;
  authenticated: boolean;
  onRequireAuth: () => void;
  lang: 'fr' | 'en';
  currentUserId: string | null;
  onStartConversation?: (userId: string) => void;
}

export default function DetailPanel({ reportId, onClose, onChanged, authenticated, onRequireAuth, lang, currentUserId, onStartConversation }: Props) {
  const [report, setReport] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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
      setError(err instanceof Error ? err.message : (lang === 'fr' ? 'Signalement introuvable.' : 'Report not found.'));
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
      setError(err instanceof Error ? err.message : (lang === 'fr' ? 'Erreur.' : 'Error.'));
    } finally {
      setEditSaving(false);
    }
  }

  async function confirm(confirmationType: 'still_present' | 'more_dangerous' | 'seems_fixed') {
    if (!authenticated) return onRequireAuth();
    try {
      await api.post(`/reports/${reportId}/confirm`, { confirmationType });
      setFeedback(lang === 'fr' ? 'Confirmation enregistrée. Merci !' : 'Confirmation recorded. Thank you!');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'fr' ? 'Action impossible.' : 'Action not possible.'));
    }
  }

  async function ownerConfirmResolved() {
    try {
      await api.post(`/reports/${reportId}/owner-confirm-resolved`, {});
      setFeedback(lang === 'fr' ? 'Ton signalement est maintenant marqué résolu.' : 'Your report is now marked as resolved.');
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'fr' ? 'Action impossible.' : 'Action not possible.'));
    }
  }

  async function suggestResolved() {
    if (!authenticated) return onRequireAuth();
    try {
      const result = await api.post<{ autoResolved: boolean; alreadySuggested: boolean }>(`/reports/${reportId}/suggest-resolution`, {});
      setFeedback(
        lang === 'fr'
          ? (result.alreadySuggested
              ? 'Tu avais déjà suggéré que ce signalement est résolu.'
              : result.autoResolved
                ? 'Merci ! Le signalement est maintenant marqué résolu.'
                : "Suggestion envoyée à la modération et à l'auteur.")
          : (result.alreadySuggested
              ? "You've already suggested this report is resolved."
              : result.autoResolved
                ? 'Thanks! The report is now marked as resolved.'
                : 'Suggestion sent to moderation and to the author.'),
      );
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'fr' ? 'Action impossible.' : 'Action not possible.'));
    }
  }

  async function flag() {
    if (!authenticated) return onRequireAuth();
    const reason = window.prompt(
      lang === 'fr' ? 'Motif (duplicate, inappropriate, wrong_location, spam, other) :' : 'Reason (duplicate, inappropriate, wrong_location, spam, other):',
      'duplicate',
    );
    if (!reason) return;
    try {
      await api.post(`/reports/${reportId}/flag`, { reason });
      setFeedback(lang === 'fr' ? 'Signalement transmis à la modération.' : 'Report sent to moderation.');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'fr' ? 'Action impossible.' : 'Action not possible.'));
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
      setError(err instanceof Error ? err.message : (lang === 'fr' ? "Impossible d'envoyer le commentaire." : 'Unable to send the comment.'));
    }
  }

  return (
    <div className="detail-panel-float mobile-visible">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="detail-title" style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{report?.problemTypeIcon ?? '📍'}</span>
          <span>{report ? pickName(report.problemTypeNameFr, report.problemTypeNameEn, lang) : (lang === 'fr' ? 'Signalement' : 'Report')}</span>
        </div>
        <button className="detail-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!report && !error && <div className="center-msg" style={{ padding: 20 }}>{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}

      {report && (
        <>
          <span className={`pill ${statusPillClass(report.status)}`} style={{ marginBottom: 10, display: 'inline-block' }}>
            {report.status === 'published_resolved'
              ? (lang === 'fr' ? 'Résolu' : 'Resolved')
              : report.status === 'pending_moderation'
                ? (lang === 'fr' ? "⏳ En attente d'approbation" : '⏳ Pending approval')
                : (lang === 'fr' ? 'Non résolu' : 'Unresolved')}
          </span>
          {report.status === 'pending_moderation' && (
            <div className="error-banner" style={{ background: 'rgba(59,156,255,0.14)', borderColor: 'var(--official-blue)', color: 'var(--official-blue)' }}>
              {lang === 'fr'
                ? "Non visible pour les autres usagers pour l'instant. Tu recevras une notification une fois approuvé et publié."
                : "Not visible to other users yet. You'll get a notification once it's approved and published."}
            </div>
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

          {!editing && report.authorId && currentUserId === report.authorId && report.pendingResolutionSuggestionsCount > 0 && (
            <div className="success-banner" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
              <span>
                ✔ {lang === 'fr'
                  ? `${report.pendingResolutionSuggestionsCount} personne(s) ont suggéré que ton signalement est résolu.`
                  : `${report.pendingResolutionSuggestionsCount} people suggested your report is resolved.`}
              </span>
              <button className="btn-primary" style={{ width: 'auto', fontSize: 12 }} onClick={ownerConfirmResolved}>
                {lang === 'fr' ? "✔ Confirmer que c'est résolu" : '✔ Confirm this is resolved'}
              </button>
            </div>
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', flexShrink: 0 }}>
              {report.photos.map((p: any, i: number) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt={lang === 'fr' ? 'Photo du signalement' : 'Report photo'}
                  onClick={() => setLightboxIndex(i)}
                  style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 9, flexShrink: 0, cursor: 'zoom-in' }}
                />
              ))}
            </div>
          )}

          {lightboxIndex !== null && (
            <Lightbox
              photos={report.photos.map((p: any) => p.url)}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}

          {!editing && report.description && (
            <TranslatableText text={report.description} lang={lang} style={{ fontSize: 12.5, marginBottom: 10 }} />
          )}

          <div className="detail-meta-row" style={{ marginBottom: 6 }}>
            <span>📍 {report.addressText ?? (lang === 'fr' ? 'Position GPS' : 'GPS position')}</span>
            <span>🕓 {new Date(report.created_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} <span style={{ color: 'var(--text-muted)' }}>({timeAgo(report.created_at, lang)})</span></span>
          </div>
          <Tooltip text={lang === 'fr' ? 'Cliquer pour copier' : 'Click to copy'}>
            <div
              style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 6, cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(report.id)}
            >
              🔗 ID : <code>{report.id}</code>
            </div>
          </Tooltip>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            👤 {lang === 'fr' ? 'Signalé par' : 'Reported by'}{' '}
            {report.authorId ? (
              <span
                onClick={() => setShowAuthorProfile(true)}
                style={{ color: 'var(--accent-signal)', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {report.authorDisplayName ?? (lang === 'fr' ? 'Anonyme' : 'Anonymous')}
              </span>
            ) : (
              lang === 'fr' ? 'Anonyme' : 'Anonymous'
            )}
          </div>
          {showAuthorProfile && report.authorId && (
            <PublicProfileModal userId={report.authorId} onClose={() => setShowAuthorProfile(false)} lang={lang} currentUserId={currentUserId} onStartConversation={onStartConversation} />
          )}

          {feedback && <div className="success-banner">{feedback}</div>}

          <div className="action-row" style={{ margin: '14px 0', flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={() => confirm('still_present')} style={{ fontSize: 11.5 }}>👍 {lang === 'fr' ? 'Toujours présent' : 'Still present'}</button>
            <button className="btn-ghost" onClick={() => confirm('more_dangerous')} style={{ fontSize: 11.5 }}>⚠️ {lang === 'fr' ? 'Plus dangereux' : 'More dangerous'}</button>
            <button className="btn-ghost" onClick={() => confirm('seems_fixed')} style={{ fontSize: 11.5 }}>✅ {lang === 'fr' ? 'Semble réparé' : 'Seems fixed'}</button>
            <button className="btn-ghost" onClick={suggestResolved}>✔ {lang === 'fr' ? 'Résolu' : 'Resolved'}</button>
            <button className="btn-ghost btn-danger" onClick={flag}>🚩</button>
          </div>

          <div className="section-label" style={{ fontSize: 13 }}>{lang === 'fr' ? 'Commentaires' : 'Comments'} ({comments.length})</div>
          {comments.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lang === 'fr' ? 'Aucun commentaire.' : 'No comments yet.'}</div>}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="comment-author">{c.authorEmail?.split('@')[0]}</div>
              {c.message}
            </div>
          ))}
          <form onSubmit={submitComment} className="comment-row">
            <input
              className="text-input"
              placeholder={lang === 'fr' ? 'Commenter...' : 'Comment...'}
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
