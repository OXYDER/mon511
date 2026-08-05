import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  reportId: string;
  onBack: () => void;
}

export default function ReportDetailPage({ reportId, onBack }: Props) {
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

  if (error) return <div className="content"><div className="error-banner">{error}</div></div>;
  if (!report) return <div className="content"><div className="center-msg">Chargement...</div></div>;

  return (
    <div className="content">
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>← Retour</button>

      <div className="detail-title">{report.description || 'Signalement'}</div>
      <div className="detail-meta-row">
        <span>📍 {report.address_text ?? 'Position GPS'}</span>
        <span>🕓 {new Date(report.created_at).toLocaleDateString('fr-CA')}</span>
        <span>👍 {report.confirmationsCount} confirmations</span>
      </div>

      {feedback && <div className="success-banner" style={{ marginTop: 16 }}>{feedback}</div>}

      <div className="action-row">
        <button className="btn-ghost" onClick={confirm}>👍 Confirmer</button>
        <button className="btn-ghost" onClick={suggestResolved}>✔ Marquer résolu</button>
        <button className="btn-ghost btn-danger" onClick={flag}>🚩 Signaler</button>
      </div>

      <div className="section-label">Commentaires ({comments.length})</div>
      {comments.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucun commentaire pour l'instant.</div>}
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <div className="comment-author">{c.authorEmail?.split('@')[0]}</div>
          {c.message}
        </div>
      ))}
      <form onSubmit={submitComment} className="comment-row">
        <input
          className="text-input"
          placeholder="Ajouter un commentaire..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <button className="btn-ghost" type="submit">Envoyer</button>
      </form>
    </div>
  );
}
