import { useState } from 'react';
import { api } from '../api';

interface Props {
  text: string;
  lang: 'fr' | 'en';
  style?: React.CSSProperties;
}

/** Affiche un texte avec un lien discret pour le traduire à la demande
 * via LibreTranslate (auto-hébergé) — jamais traduit automatiquement
 * sans action de l'usager, pour éviter les appels inutiles au service.
 * Une fois traduit, un lien permet de revenir au texte original en tout
 * temps. On tente de deviner la langue source à partir de la langue
 * active du site — pas parfait (le texte pourrait avoir été écrit dans
 * l'autre langue), mais un choix raisonnable par défaut. */
export default function TranslatableText({ text, lang, style }: Props) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState(false);
  const fr = lang === 'fr';

  async function translate() {
    setTranslating(true);
    setError(false);
    try {
      // On traduit VERS la langue active du site, en devinant que le
      // texte a été écrit dans l'autre langue — l'usager peut toujours
      // revenir à l'original si la traduction ne s'applique pas.
      const source = fr ? 'en' : 'fr';
      const target = fr ? 'fr' : 'en';
      const result = await api.post<{ translatedText: string }>('/translation/translate', { text, source, target });
      setTranslated(result.translatedText);
    } catch {
      setError(true);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div style={style}>
      <div style={{ lineHeight: 1.5 }}>{translated ?? text}</div>
      {!translated && !translating && (
        <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 0', color: 'var(--accent-signal)' }} onClick={translate}>
          🌐 {fr ? 'Traduire' : 'Translate'}
        </button>
      )}
      {translating && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fr ? 'Traduction...' : 'Translating...'}</span>
      )}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--status-danger, #FF4D5E)' }}>
          {fr ? 'Échec de la traduction.' : 'Translation failed.'}
        </span>
      )}
      {translated && (
        <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 0', color: 'var(--text-muted)' }} onClick={() => setTranslated(null)}>
          {fr ? "Voir le texte original" : 'Show original text'}
        </button>
      )}
    </div>
  );
}
