import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  lang: 'fr' | 'en';
  onVisibleChange?: (visible: boolean) => void;
}

const DISMISS_KEY_PREFIX = 'mon511_banner_dismissed_v';

export default function SiteBanner({ lang, onVisibleChange }: Props) {
  const [banner, setBanner] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get<any>('/public/site-banner').then((data) => {
      if (!data?.enabled) return;
      // Fenêtre de dates optionnelle — si définie, la bannière ne s'affiche
      // qu'à l'intérieur de cette plage.
      const now = new Date();
      if (data.startDate && now < new Date(data.startDate)) return;
      if (data.endDate && now > new Date(data.endDate)) return;

      // Fermée par l'usager pour CETTE version précise du message — si
      // l'admin modifie le contenu (version incrémentée), la bannière
      // réapparaît même pour ceux qui avaient fermé l'ancienne.
      const wasDismissed = localStorage.getItem(`${DISMISS_KEY_PREFIX}${data.version ?? 1}`) === '1';
      setDismissed(wasDismissed);
      setBanner(data);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = !!banner && !dismissed;

  useEffect(() => {
    onVisibleChange?.(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  function close() {
    localStorage.setItem(`${DISMISS_KEY_PREFIX}${banner.version ?? 1}`, '1');
    setDismissed(true);
  }

  const message = lang === 'en' && banner.messageEn ? banner.messageEn : banner.message;

  return (
    <div className="site-banner">
      <span>{message}</span>
      <button onClick={close} aria-label={lang === 'fr' ? 'Fermer' : 'Close'}>✕</button>
    </div>
  );
}
