// Injecté automatiquement à chaque build de production (voir web/Dockerfile,
// horodatage exact du build) — évolue tout seul à chaque déploiement, plus
// besoin de le modifier à la main. En développement local (sans ce build),
// retombe sur un repli clairement identifiable plutôt qu'une fausse date.
const raw = import.meta.env.VITE_BUILD_VERSION as string | undefined;

export const APP_VERSION = raw ?? 'dev';
export const BUILD_DATE = raw
  ? `${raw.slice(0, 4)}-${raw.slice(5, 7)}-${raw.slice(8, 10)} ${raw.slice(11, 13)}h${raw.slice(13, 15)} UTC`
  : 'développement local';
