import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  reportId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function DetailPanel({ reportId, onClose, onChanged }: Props) {
  const [report, setReport] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [r, c] = await Promise.all([
        api.get<any>(`/reports/${reportId}`),
        api.get<any[]>(`/reports/${reportId}/comments`),
      ]);
      setReport(r);
      setComments(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signalement introuvable.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function confirm() {
    try {
      await api.post(`/reports/${reportId}/confirm`);
      setFeedback('Confirmation enregistrée. Merci !');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  }

  async function suggestResolved() {
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
        <div className="detail-title" style={{ fontSize: 17 }}>{report?.description || 'Signalement'}</div>
        <button className="detail-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!report && !error && <div className="center-msg" style={{ padding: 20 }}>Chargement...</div>}

      {report && (
        <>
          <div className="detail-meta-row" style={{ marginBottom: 14 }}>
            <span>📍 {report.address_text ?? 'Position GPS'}</span>
            <span>🕓 {new Date(report.created_at).toLocaleDateString('fr-CA')}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            👍 {report.confirmationsCount} confirmations
          </div>

          {feedback && <div className="success-banner">{feedback}</div>}

          <div className="action-row" style={{ margin: '14px 0' }}>
            <button className="btn-ghost" onClick={confirm}>👍 Confirmer</button>
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
