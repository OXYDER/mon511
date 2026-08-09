import { APP_VERSION, BUILD_DATE } from '../version';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

export default function AboutModal({ onClose, lang }: Props) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 380 }}>
        <div className="modal-head">
          <div className="modal-title">{lang === 'fr' ? 'À propos' : 'About'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <img src="/icons/icon-192.png" alt="" style={{ width: 68, height: 68 }} />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <img src="/brand/logo-full.png" alt="mon511.ca" style={{ width: '100%', maxWidth: 280 }} />
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 18 }}>
            {lang === 'fr'
              ? "Plateforme communautaire bilingue de signalement d'incidents routiers au Québec, combinée aux données officielles du MTQ et de la SOPFEU."
              : 'Bilingual community platform for reporting road incidents in Québec, combined with official MTQ and SOPFEU data.'}
          </p>

          <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            {lang === 'fr' ? 'Équipe' : 'Team'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted)' }}>{lang === 'fr' ? 'Fondateur' : 'Founder'}</span>
            <span>Benoît Laprise</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted)' }}>{lang === 'fr' ? 'Contact' : 'Contact'}</span>
            <a href="mailto:info@mon511.ca" style={{ color: 'var(--accent-signal)' }}>info@mon511.ca</a>
          </div>

          <div className="section-label">{lang === 'fr' ? 'Sources de données officielles' : 'Official data sources'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            Ministère des Transports et de la Mobilité durable (MTQ)<br />
            SOPFEU (feux de forêt)<br />
            SIT Québec (agrotourisme)<br />
            MapTiler (cartographie)
          </div>

          <div className="section-label">{lang === 'fr' ? 'Technique' : 'Technical'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            {lang === 'fr' ? 'Version' : 'Version'} : {APP_VERSION}<br />
            {lang === 'fr' ? 'Compilé le' : 'Built on'} : {BUILD_DATE}
          </div>
        </div>
      </div>
    </div>
  );
}
