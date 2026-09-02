import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { timeAgo } from '../i18n';
import ConfirmModal from './ConfirmModal';
import Tooltip from './Tooltip';

interface Props {
  lang: 'fr' | 'en';
  currentUserId: string | null;
  onClose: () => void;
  onViewProfile: (userId: string) => void;
  onViewReport: (reportId: string) => void;
  onOpenMunicipality: (regionId: string) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const CATEGORIES: { key: string; icon: string; fr: string; en: string }[] = [
  { key: 'road_conditions', icon: '🛣️', fr: 'État des routes', en: 'Road conditions' },
  { key: 'community', icon: '🤝', fr: 'Vie communautaire', en: 'Community life' },
  { key: 'general', icon: '💬', fr: 'Général', en: 'General' },
];

function CategoryBadge({ category, lang }: { category: string; lang: 'fr' | 'en' }) {
  const cat = CATEGORIES.find((c) => c.key === category);
  if (!cat) return null;
  return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat.icon} {lang === 'fr' ? cat.fr : cat.en}</span>;
}

export default function CommunityFeedPage({ lang, currentUserId, onClose, onViewProfile, onViewReport, onOpenMunicipality }: Props) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, any[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [reactingToPostId, setReactingToPostId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [municipalityResults, setMunicipalityResults] = useState<any[]>([]);
  const fr = lang === 'fr';

  async function load() {
    try {
      setLoading(true);
      const data = await api.get<any[]>(`/posts${activeCategory ? `?category=${activeCategory}` : ''}`);
      setPosts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [activeCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (municipalitySearch.trim().length < 2) { setMunicipalityResults([]); return; }
    const timeout = setTimeout(() => {
      api.get<any[]>(`/municipal-portal/search-regions?search=${encodeURIComponent(municipalitySearch)}`).then(setMunicipalityResults).catch(() => {});
    }, 300);
    return () => clearTimeout(timeout);
  }, [municipalitySearch]);

  async function toggleComments(postId: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
    if (!commentsByPost[postId]) {
      const data = await api.get<any[]>(`/posts/${postId}/comments`).catch(() => []);
      setCommentsByPost((prev) => ({ ...prev, [postId]: data }));
    }
  }

  async function submitComment(postId: string) {
    const body = (commentDraft[postId] ?? '').trim();
    if (!body) return;
    const comment = await api.post<any>(`/posts/${postId}/comments`, { body }).catch(() => null);
    if (!comment) return;
    setCommentsByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), comment] }));
    setCommentDraft((prev) => ({ ...prev, [postId]: '' }));
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)));
  }

  async function toggleReaction(postId: string, emoji: string) {
    setReactingToPostId(null);
    const result = await api.post<{ added: boolean }>(`/posts/${postId}/react`, { emoji }).catch(() => null);
    if (!result || !currentUserId) return;
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const reactions = result.added
        ? [...(p.reactions ?? []), { post_id: postId, user_id: currentUserId, emoji }]
        : (p.reactions ?? []).filter((r: any) => !(r.user_id === currentUserId && r.emoji === emoji));
      return { ...p, reactions };
    }));
  }

  async function confirmDelete() {
    if (!confirmingDeleteId) return;
    await api.delete(`/posts/${confirmingDeleteId}`).catch(() => {});
    setPosts((prev) => prev.filter((p) => p.id !== confirmingDeleteId));
    setConfirmingDeleteId(null);
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 480, maxWidth: '95vw', display: 'flex', flexDirection: 'column', height: '86vh' }}>
        <div className="modal-head">
          <div className="modal-title">{fr ? 'Communauté' : 'Community'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ position: 'relative', marginBottom: 12, flexShrink: 0 }}>
            <input
              className="text-input"
              style={{ width: '100%', fontSize: 12.5 }}
              placeholder={fr ? '🏛️ Voir la page d\'une municipalité...' : '🏛️ View a municipality page...'}
              value={municipalitySearch}
              onChange={(e) => setMunicipalitySearch(e.target.value)}
            />
            {municipalityResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 10, marginTop: 4, zIndex: 5, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
                {municipalityResults.map((r) => (
                  <div
                    key={r.regionId}
                    className="search-dropdown-item"
                    onClick={() => { onOpenMunicipality(r.regionId); setMunicipalitySearch(''); setMunicipalityResults([]); }}
                  >
                    {r.regionNameFr}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', flexShrink: 0 }}>
            <button className={`btn-ghost ${!activeCategory ? 'active' : ''}`} style={{ fontSize: 11.5, padding: '6px 12px', flexShrink: 0 }} onClick={() => setActiveCategory(null)}>
              {fr ? 'Tout' : 'All'}
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={`btn-ghost ${activeCategory === c.key ? 'active' : ''}`}
                style={{ fontSize: 11.5, padding: '6px 12px', flexShrink: 0 }}
                onClick={() => setActiveCategory(c.key)}
              >
                {c.icon} {fr ? c.fr : c.en}
              </button>
            ))}
          </div>

          <button className="btn-primary" style={{ marginBottom: 12, flexShrink: 0 }} onClick={() => setShowComposer(true)}>
            ✏️ {fr ? 'Publier quelque chose' : 'Share something'}
          </button>

          {error && <div className="error-banner" style={{ flexShrink: 0 }}>{error}</div>}
          {loading && <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>}
          {!loading && posts.length === 0 && (
            <div className="center-msg">{fr ? 'Aucune publication pour le moment.' : 'No posts yet.'}</div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {posts.map((post) => {
              const groupedReactions = (post.reactions ?? []).reduce((acc: Record<string, number>, r: any) => {
                acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                return acc;
              }, {});
              return (
                <div key={post.id} style={{ background: 'var(--panel-hover)', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div
                      className="rc-icon-hex"
                      style={{ width: 32, height: 32, cursor: 'pointer' }}
                      onClick={() => onViewProfile(post.author_id)}
                    >
                      {post.authorAvatarUrl ? (
                        <img src={post.authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        (post.authorDisplayName?.[0] ?? '?').toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => onViewProfile(post.author_id)}>
                        {post.authorDisplayName}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{timeAgo(post.created_at, lang)}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>·</span>
                        <CategoryBadge category={post.category} lang={lang} />
                        {post.visibility === 'friends' && (
                          <Tooltip text={fr ? 'Amis seulement' : 'Friends only'}>
                            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>· 🔒</span>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    {post.isMine && (
                      <button className="btn-ghost" style={{ fontSize: 11, color: 'var(--status-danger, #FF4D5E)' }} onClick={() => setConfirmingDeleteId(post.id)}>
                        🗑️
                      </button>
                    )}
                  </div>

                  {post.body && <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: post.media?.length || post.linkUrl || post.reportId ? 10 : 0 }}>{post.body}</p>}

                  {post.reportId && (
                    <div
                      onClick={() => onViewReport(post.reportId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel-solid)', borderRadius: 10, padding: 10, marginBottom: 10, cursor: 'pointer', border: '1px solid var(--panel-border)' }}
                    >
                      <span style={{ fontSize: 20 }}>{post.reportProblemTypeIcon ?? '📍'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {fr ? post.reportProblemTypeNameFr : post.reportProblemTypeNameEn}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {post.reportAddressText}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--accent-signal)' }}>{fr ? 'Voir →' : 'View →'}</span>
                    </div>
                  )}

                  {post.linkUrl && (
                    <a href={post.linkUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 12.5, color: 'var(--accent-signal)', marginBottom: 10, wordBreak: 'break-all' }}>
                      🔗 {post.linkUrl}
                    </a>
                  )}

                  {post.media?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
                      {post.media.map((m: any) => (
                        m.media_type === 'video' ? (
                          <video key={m.id} src={m.url} controls style={{ maxHeight: 220, borderRadius: 10, flexShrink: 0 }} />
                        ) : (
                          <img key={m.id} src={m.url} alt="" style={{ maxHeight: 220, borderRadius: 10, flexShrink: 0, objectFit: 'cover' }} />
                        )
                      ))}
                    </div>
                  )}

                  {Object.keys(groupedReactions).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                      {Object.entries(groupedReactions).map(([emoji, count]) => (
                        <span key={emoji} style={{ fontSize: 11, background: 'var(--panel-solid)', borderRadius: 10, padding: '2px 8px', border: '1px solid var(--panel-border)' }}>
                          {emoji} {Number(count) > 1 ? Number(count) : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)', position: 'relative' }}>
                    <span style={{ cursor: 'pointer' }} onClick={() => setReactingToPostId(reactingToPostId === post.id ? null : post.id)}>😊 {fr ? 'Réagir' : 'React'}</span>
                    <span style={{ cursor: 'pointer' }} onClick={() => toggleComments(post.id)}>
                      💬 {post.commentCount > 0 ? post.commentCount : ''} {fr ? 'Commenter' : 'Comment'}
                    </span>

                    {reactingToPostId === post.id && (
                      <div style={{ position: 'absolute', top: 20, left: 0, display: 'flex', gap: 4, background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 20, padding: '4px 8px', boxShadow: 'var(--shadow-panel)', zIndex: 2 }}>
                        {QUICK_EMOJIS.map((emoji) => (
                          <span key={emoji} style={{ cursor: 'pointer', fontSize: 15 }} onClick={() => toggleReaction(post.id, emoji)}>{emoji}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {expandedComments.has(post.id) && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(commentsByPost[post.id] ?? []).map((c) => (
                        <div key={c.id} style={{ display: 'flex', gap: 8 }}>
                          <div className="rc-icon-hex" style={{ width: 24, height: 24, fontSize: 11, flexShrink: 0, cursor: 'pointer' }} onClick={() => onViewProfile(c.authorId)}>
                            {c.authorAvatarUrl ? (
                              <img src={c.authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            ) : (
                              (c.authorDisplayName?.[0] ?? '?').toUpperCase()
                            )}
                          </div>
                          <div style={{ background: 'var(--panel-solid)', borderRadius: 10, padding: '6px 10px', fontSize: 12, flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 11.5 }}>{c.authorDisplayName}</div>
                            {c.body}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          className="text-input"
                          style={{ fontSize: 12 }}
                          placeholder={fr ? 'Écrire un commentaire...' : 'Write a comment...'}
                          value={commentDraft[post.id] ?? ''}
                          onChange={(e) => setCommentDraft((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && submitComment(post.id)}
                        />
                        <button className="btn-primary" style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => submitComment(post.id)}>
                          {fr ? 'Envoyer' : 'Send'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showComposer && (
        <PostComposer
          lang={lang}
          onClose={() => setShowComposer(false)}
          onPublished={() => { setShowComposer(false); load(); }}
        />
      )}

      {confirmingDeleteId && (
        <ConfirmModal
          title={fr ? 'Supprimer cette publication ?' : 'Delete this post?'}
          message={fr ? 'Cette action est irréversible.' : 'This action cannot be undone.'}
          confirmLabel={fr ? 'Supprimer' : 'Delete'}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDeleteId(null)}
        />
      )}
    </div>
  );
}

/** Formulaire de création d'une publication — catégorie, texte, lien,
 * médias (photo/vidéo — la vidéo respecte la bascule admin, vérifiée
 * aussi côté serveur), visibilité publique ou amis seulement. */
function PostComposer({ lang, onClose, onPublished }: { lang: 'fr' | 'en'; onClose: () => void; onPublished: () => void }) {
  const [category, setCategory] = useState('general');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [pendingFiles, setPendingFiles] = useState<{ file: File; type: 'photo' | 'video'; previewUrl: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fr = lang === 'fr';

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const added = files.map((file) => ({
      file,
      type: (file.type.startsWith('video/') ? 'video' : 'photo') as 'photo' | 'video',
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingFiles((prev) => [...prev, ...added]);
    e.target.value = '';
  }

  async function publish() {
    if (!body.trim() && pendingFiles.length === 0 && !linkUrl.trim()) {
      setError(fr ? 'Écris quelque chose, ajoute une photo/vidéo, ou un lien.' : 'Write something, add a photo/video, or a link.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const post = await api.post<any>('/posts', {
        category,
        body: body.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        visibility,
      });

      for (let i = 0; i < pendingFiles.length; i++) {
        const { file, type } = pendingFiles[i];
        const formData = new FormData();
        formData.append('file', file);
        const uploaded = await api.post<{ url: string }>(`/posts/media/${type}`, formData);
        await api.post(`/posts/${post.id}/media`, { url: uploaded.url, mediaType: type, orderIndex: i });
      }

      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 450 }}>
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-head">
          <div className="modal-title">{fr ? 'Publier quelque chose' : 'Share something'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className="btn-ghost"
                style={{ fontSize: 11.5, padding: '6px 12px', border: category === c.key ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }}
                onClick={() => setCategory(c.key)}
              >
                {c.icon} {fr ? c.fr : c.en}
              </button>
            ))}
          </div>

          <textarea
            className="text-input"
            style={{ width: '100%', minHeight: 90, resize: 'vertical', fontFamily: 'inherit', fontSize: 13.5, marginBottom: 10 }}
            placeholder={fr ? "Qu'est-ce que tu veux partager?" : "What do you want to share?"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <input
            className="text-input"
            style={{ width: '100%', marginBottom: 10 }}
            placeholder={fr ? 'Lien (optionnel)' : 'Link (optional)'}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />

          {pendingFiles.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
              {pendingFiles.map((f, i) => (
                <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                  {f.type === 'video' ? (
                    <video src={f.previewUrl} style={{ height: 70, borderRadius: 8 }} />
                  ) : (
                    <img src={f.previewUrl} alt="" style={{ height: 70, borderRadius: 8, objectFit: 'cover' }} />
                  )}
                  <button
                    onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--status-danger, #FF4D5E)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
          <button className="btn-ghost" style={{ marginBottom: 14 }} onClick={() => fileInputRef.current?.click()}>
            📷 {fr ? 'Ajouter photo ou vidéo' : 'Add photo or video'}
          </button>

          <div className="field-group" style={{ marginBottom: 16 }}>
            <label className="field-label">{fr ? 'Qui peut voir cette publication?' : 'Who can see this post?'}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1, border: visibility === 'public' ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => setVisibility('public')}>
                🌐 {fr ? 'Public' : 'Public'}
              </button>
              <button className="btn-ghost" style={{ flex: 1, border: visibility === 'friends' ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => setVisibility('friends')}>
                🔒 {fr ? 'Amis seulement' : 'Friends only'}
              </button>
            </div>
          </div>

          <button className="btn-primary" style={{ width: '100%' }} onClick={publish} disabled={publishing}>
            {publishing ? (fr ? 'Publication...' : 'Publishing...') : (fr ? 'Publier' : 'Publish')}
          </button>
        </div>
      </div>
    </div>
  );
}
