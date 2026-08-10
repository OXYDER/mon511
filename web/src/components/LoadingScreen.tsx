interface Props {
  visible: boolean;
}

/** Écran de chargement animé (mascotte en boucle) — réservé aux VRAIS gros
 * chargements (premier affichage de la carte au démarrage de l'app). Les
 * petites actions (bascule d'un interrupteur, envoi d'un commentaire, etc.)
 * gardent leur indicateur léger existant ("..." ou icône ⏳) pour ne pas
 * surcharger l'interface d'animations pour des attentes de moins d'une
 * seconde. */
export default function LoadingScreen({ visible }: Props) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'var(--bg-asphalt)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.4s ease',
      }}
    >
      <video
        src="/loading.webm"
        autoPlay
        loop
        muted
        playsInline
        style={{ width: 180, height: 180 }}
      />
    </div>
  );
}
