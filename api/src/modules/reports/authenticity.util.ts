interface PhotoExifInput {
  exif_latitude: number | null;
  exif_longitude: number | null;
  exif_captured_at: Date | string | null;
}

export interface AuthenticitySignal {
  /** false = aucune photo n'a de métadonnées GPS exploitables — dans ce cas
   * on ne donne PAS de pourcentage inventé, on dit clairement que ce n'est
   * pas vérifiable plutôt que de faire semblant d'avoir un signal. */
  verifiable: boolean;
  confidencePercent: number | null;
  distanceMeters: number | null;
  daysSinceCapture: number | null;
  details: string[];
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Signal de confiance transparent — pas une "boîte noire" qui invente un
 * chiffre. Si aucune photo n'a de métadonnées GPS (très courant — beaucoup
 * de messageries retirent l'EXIF), on le dit clairement plutôt que
 * d'afficher un pourcentage trompeur. La décision finale reste toujours
 * humaine (voir écran de modération) — ceci est une aide, pas un verdict.
 */
export function computeAuthenticitySignal(
  photos: PhotoExifInput[],
  reportLat: number,
  reportLng: number,
  reportCreatedAt: Date,
): AuthenticitySignal {
  const withGps = photos.filter((p) => p.exif_latitude != null && p.exif_longitude != null);

  if (withGps.length === 0) {
    return {
      verifiable: false,
      confidencePercent: null,
      distanceMeters: null,
      daysSinceCapture: null,
      details: ["Aucune photo ne contient de coordonnées GPS dans ses métadonnées — vérification impossible à partir des photos (courant : messagerie, réseau social ou capture d'écran qui retire l'EXIF)."],
    };
  }

  let minDistance = Infinity;
  for (const p of withGps) {
    const d = haversineMeters(reportLat, reportLng, p.exif_latitude!, p.exif_longitude!);
    if (d < minDistance) minDistance = d;
  }

  const details: string[] = [];
  let score = 100;

  if (minDistance > 800) {
    score -= 50;
    details.push(`La position GPS d'au moins une photo est à environ ${Math.round(minDistance)} m de la position déclarée du signalement — à vérifier.`);
  } else {
    details.push(`La position GPS de la photo correspond à la position déclarée (écart ≈ ${Math.round(minDistance)} m).`);
  }

  const withDate = photos.filter((p) => p.exif_captured_at);
  let daysSinceCapture: number | null = null;
  if (withDate.length > 0) {
    const captured = new Date(withDate[0].exif_captured_at as any);
    daysSinceCapture = Math.round((reportCreatedAt.getTime() - captured.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceCapture > 14 || daysSinceCapture < -1) {
      score -= 20;
      details.push(
        daysSinceCapture >= 0
          ? `La photo semble avoir été prise ${daysSinceCapture} jours avant le signalement — possiblement une photo réutilisée plutôt que prise sur le fait.`
          : `La date de capture de la photo est postérieure à la date du signalement — étrange, à vérifier.`,
      );
    } else {
      details.push(`La photo a été prise récemment (${Math.max(daysSinceCapture, 0)} jour(s) avant l'envoi du signalement).`);
    }
  } else {
    details.push("Aucune date de capture disponible dans les métadonnées de la photo.");
  }

  return {
    verifiable: true,
    confidencePercent: Math.max(0, Math.min(100, score)),
    distanceMeters: Math.round(minDistance),
    daysSinceCapture,
    details,
  };
}
