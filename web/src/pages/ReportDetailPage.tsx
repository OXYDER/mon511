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
      setFeedback(result.autoResolved ? 'Merci ! Le signalement est maintenant marqué résolu.' : 'Suggestion envoyée à la modération et à l\'auteur.');
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
      setError(err instanceof Error ? err.message : 'Impossible d\'envoyer le commentaire.');
    }
  }

  if (error) return <div className="content"><div className="error-banner">{error}</div></div>;
  if (!report) return <div className="content"><div className="center-msg">Chargement...</div></div>;

  return (
    <div className="content">
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 14 }}>← Retour</button>

      <div className="detail-header">
        <div className="detail-title">{report.description || 'Signalement'}</div>
        <div className="rc-meta">{report.address_text ?? 'Position GPS'} · {new Date(report.created_at).toLocaleDateString('fr-CA')}</div>
      </div>

      {feedback && <div className="error-banner" style={{ background: 'rgba(47,191,113,0.14)', color: 'var(--status-resolved)', borderColor: 'var(--status-resolved)' }}>{feedback}</div>}

      <div className="action-row">
        <button className="btn-ghost" onClick={confirm}>👍 Confirmer</button>
        <button className="btn-ghost" onClick={suggestResolved}>✔ Marquer résolu</button>
        <button className="btn-ghost btn-danger" onClick={flag}>🚩 Signaler</button>
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, margin: '20px 0 10px' }}>
        Commentaires ({comments.length})
      </div>
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <div className="comment-author">{c.authorEmail?.split('@')[0]}</div>
          {c.message}
        </div>
      ))}
      <form onSubmit={submitComment} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
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
