interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

/** Contenu de départ raisonnable, PAS un texte juridiquement validé — à
 * faire réviser par un juriste avant de le considérer final, surtout
 * étant donné les exigences de la Loi 25 au Québec (droit d'accès, de
 * rectification, de retrait du consentement, etc.). */
export default function PrivacyPolicyModal({ onClose, lang }: Props) {
  const fr = lang === 'fr';
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-head">
          <div className="modal-title">{fr ? 'Politique de vie privée' : 'Privacy Policy'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 14 }}>
            {fr ? 'Dernière mise à jour : août 2026' : 'Last updated: August 2026'}
          </p>

          <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            {fr ? 'Renseignements recueillis' : 'Information collected'}
          </div>
          <p>
            {fr
              ? "Lors de la création d'un compte : ton adresse courriel, prénom et nom de famille (optionnel). Lors de l'utilisation du Service : les signalements que tu soumets (position géographique, photo, description), les messages échangés avec d'autres usagers, et ton adresse IP à des fins de sécurité."
              : 'When creating an account: your email address, first and last name (optional). While using the Service: the reports you submit (geographic location, photo, description), messages exchanged with other users, and your IP address for security purposes.'}
          </p>

          <div className="section-label">{fr ? 'Utilisation des renseignements' : 'Use of information'}</div>
          <p>
            {fr
              ? "Tes renseignements servent uniquement à faire fonctionner le Service : afficher tes signalements, te permettre de communiquer avec tes amis, et t'envoyer des notifications relatives à ton compte. mon511 ne vend ni ne loue jamais tes renseignements personnels à des tiers, et n'affiche aucune publicité."
              : "Your information is used solely to operate the Service: displaying your reports, allowing you to communicate with your friends, and sending you account-related notifications. mon511 never sells or rents your personal information to third parties, and displays no advertising."}
          </p>

          <div className="section-label">{fr ? 'Ce que les autres usagers voient' : 'What other users see'}</div>
          <p>
            {fr
              ? "Par défaut, ton prénom (et une partie de ton nom, selon ton choix), ta réputation et ta région peuvent être visibles publiquement. Tu contrôles chacun de ces éléments individuellement dans les paramètres de confidentialité de ton profil, incluant ton statut « en ligne »."
              : 'By default, your first name (and part of your last name, based on your choice), your reputation, and your region may be publicly visible. You control each of these individually in your profile\'s privacy settings, including your "online" status.'}
          </p>

          <div className="section-label">{fr ? 'Conservation' : 'Retention'}</div>
          <p>
            {fr
              ? "Tes renseignements sont conservés tant que ton compte existe. Tu peux demander la suppression de ton compte et des données associées en tout temps en nous contactant."
              : 'Your information is kept as long as your account exists. You may request deletion of your account and associated data at any time by contacting us.'}
          </p>

          <div className="section-label">{fr ? 'Sous-traitants et hébergement' : 'Processors and hosting'}</div>
          <p>
            {fr
              ? "Le Service est hébergé sur une infrastructure privée, avec Cloudflare comme protection et accélération réseau. Ces services techniques ont accès aux données strictement nécessaires à leur fonction, sans droit de les utiliser à d'autres fins."
              : 'The Service is hosted on private infrastructure, with Cloudflare providing network protection and acceleration. These technical services have access only to data strictly necessary for their function, with no right to use it for other purposes.'}
          </p>

          <div className="section-label">{fr ? 'Tes droits' : 'Your rights'}</div>
          <p>
            {fr
              ? "Conformément à la loi québécoise sur la protection des renseignements personnels, tu as le droit d'accéder à tes renseignements, de les faire rectifier, et de retirer ton consentement à leur utilisation (ce qui peut entraîner la fermeture de ton compte). Pour exercer ces droits, contacte-nous."
              : 'In accordance with Québec privacy law, you have the right to access your information, have it corrected, and withdraw your consent to its use (which may result in your account being closed). To exercise these rights, contact us.'}
          </p>

          <div className="section-label">{fr ? 'Contact' : 'Contact'}</div>
          <p>
            {fr ? 'Questions ou demandes concernant tes renseignements personnels : ' : 'Questions or requests about your personal information: '}
            <a href="mailto:info@mon511.ca" style={{ color: 'var(--accent-signal)' }}>info@mon511.ca</a>
          </p>
        </div>
      </div>
    </div>
  );
}
