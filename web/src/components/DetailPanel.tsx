import { useEffect, useState } from 'react';
import { api } from '../api';
import Lightbox from './Lightbox';
import PublicProfileModal from './PublicProfileModal';
import { pickName, timeAgo, statusPillClass } from '../i18n';
import TranslatableText from './TranslatableText';

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

  async function confirm() {
    if (!authenticated) return onRequireAuth();
    try {
      await api.post(`/reports/${reportId}/confirm`);
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

        </>
      )}
    </div>
  );
}
