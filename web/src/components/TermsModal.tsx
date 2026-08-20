interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

/** Contenu de départ raisonnable, PAS un texte juridiquement validé — à
 * faire réviser par un juriste avant de le considérer final, surtout
 * étant donné les exigences de la Loi 25 au Québec. */
export default function TermsModal({ onClose, lang }: Props) {
  const fr = lang === 'fr';
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-head">
          <div className="modal-title">{fr ? "Termes et conditions d'utilisation" : 'Terms of Use'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 14 }}>
            {fr ? 'Dernière mise à jour : août 2026' : 'Last updated: August 2026'}
          </p>

          <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            {fr ? '1. Objet du service' : '1. Purpose of the service'}
          </div>
          <p>
            {fr
              ? "mon511.ca (le « Service ») est une plateforme communautaire permettant aux usagers de signaler et consulter des dangers routiers au Québec, combinés à des données officielles publiques (MTQ, SOPFEU). Le Service est offert « tel quel », sans garantie d'exactitude, de disponibilité continue ou d'exhaustivité."
              : 'mon511.ca (the "Service") is a community platform allowing users to report and view road hazards in Québec, combined with official public data (MTQ, SOPFEU). The Service is provided "as is", without guarantee of accuracy, continuous availability, or completeness.'}
          </p>

          <div className="section-label">{fr ? '2. Compte usager' : '2. User account'}</div>
          <p>
            {fr
              ? "Tu es responsable de la confidentialité de ton mot de passe et de toute activité effectuée depuis ton compte. Tu dois fournir une adresse courriel valide et des informations exactes. mon511 se réserve le droit de suspendre ou fermer un compte en cas de non-respect de ces conditions."
              : "You are responsible for keeping your password confidential and for any activity conducted from your account. You must provide a valid email address and accurate information. mon511 reserves the right to suspend or close an account for violating these terms."}
          </p>

          <div className="section-label">{fr ? '3. Contenu soumis par les usagers' : '3. User-submitted content'}</div>
          <p>
            {fr
              ? "En soumettant un signalement, une photo ou un message, tu confirmes en être le véritable auteur et accordes à mon511 le droit de l'afficher publiquement dans le cadre normal du Service. Tu t'engages à ne soumettre que du contenu exact, légal et respectueux — les signalements frauduleux, diffamatoires ou abusifs peuvent être retirés et entraîner la suspension du compte."
              : 'By submitting a report, photo, or message, you confirm you are its genuine author and grant mon511 the right to display it publicly as part of the normal operation of the Service. You agree to submit only accurate, lawful, and respectful content — fraudulent, defamatory, or abusive reports may be removed and may result in account suspension.'}
          </p>

          <div className="section-label">{fr ? '4. Limitation de responsabilité' : '4. Limitation of liability'}</div>
          <p>
            {fr
              ? "mon511 est un outil d'information communautaire complémentaire, pas une source officielle de sécurité routière. Vérifie toujours les conditions réelles avant de prendre une décision de conduite. mon511 ne peut être tenu responsable des dommages découlant de l'utilisation ou de l'impossibilité d'utiliser le Service, ni de l'exactitude des signalements soumis par d'autres usagers."
              : 'mon511 is a complementary community information tool, not an official road safety source. Always verify actual conditions before making a driving decision. mon511 cannot be held liable for damages arising from the use or inability to use the Service, nor for the accuracy of reports submitted by other users.'}
          </p>

          <div className="section-label">{fr ? '5. Modération' : '5. Moderation'}</div>
          <p>
            {fr
              ? "L'équipe de modération peut retirer, modifier le statut, ou demander des précisions sur tout signalement, sans préavis, dans le but de maintenir la fiabilité du Service."
              : 'The moderation team may remove, change the status of, or request clarification on any report, without notice, in order to maintain the reliability of the Service.'}
          </p>

          <div className="section-label">{fr ? '6. Modifications' : '6. Changes'}</div>
          <p>
            {fr
              ? "Ces termes peuvent être mis à jour à l'occasion. L'utilisation continue du Service après une modification constitue une acceptation des nouveaux termes."
              : 'These terms may be updated from time to time. Continued use of the Service after a change constitutes acceptance of the new terms.'}
          </p>

          <div className="section-label">{fr ? '7. Contact' : '7. Contact'}</div>
          <p>
            {fr ? 'Questions concernant ces termes : ' : 'Questions about these terms: '}
            <a href="mailto:info@mon511.ca" style={{ color: 'var(--accent-signal)' }}>info@mon511.ca</a>
          </p>
        </div>
      </div>
    </div>
  );
}
