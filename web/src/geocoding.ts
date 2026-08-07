const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface GeocodingResult {
  name: string;
  lat: number;
  lng: number;
}

/** Recherche plusieurs villes/adresses au Québec via MapTiler, pour un menu
 * déroulant de suggestions façon Google Maps. */
export async function searchCities(query: string, limit = 4): Promise<GeocodingResult[]> {
  if (!MAPTILER_KEY || !query.trim()) return [];
  try {
    const res = await fetch(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&country=ca&limit=${limit}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? []).map((f: any) => ({ name: f.place_name, lat: f.center[1], lng: f.center[0] }));
  } catch {
    return [];
  }
}

/** Repli pratique pour un seul résultat (ex. soumission directe du formulaire). */
export async function searchCity(query: string): Promise<GeocodingResult | null> {
  const results = await searchCities(query, 1);
  return results[0] ?? null;
}

const PROVINCE_ABBR: Record<string, string> = {
  Québec: 'QC', Ontario: 'ON', 'Colombie-Britannique': 'BC', Alberta: 'AB',
  Manitoba: 'MB', Saskatchewan: 'SK', 'Nouvelle-Écosse': 'NS', 'Nouveau-Brunswick': 'NB',
  'Île-du-Prince-Édouard': 'PE', 'Terre-Neuve-et-Labrador': 'NL',
  Yukon: 'YT', 'Territoires du Nord-Ouest': 'NT', Nunavut: 'NU',
};

/** Géocodage inverse — retourne le nom du lieu le plus pertinent selon le
 * niveau de zoom : province quand on est très dézoomé, municipalité à un
 * zoom moyen, quartier/adresse quand on est rapproché. */
export async function reverseGeocode(lat: number, lng: number, zoom = 12): Promise<string | null> {
  if (!MAPTILER_KEY) return null;
  try {
    const res = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${MAPTILER_KEY}&language=fr`);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const context: any[] = feature.context ?? [];
    const findByPrefix = (prefix: string) => context.find((c: any) => c.id?.startsWith(prefix))?.text;
    const regionName = findByPrefix('region');
    const abbr = regionName ? (PROVINCE_ABBR[regionName] ?? regionName) : null;

    if (zoom < 7) {
      // Très dézoomé : la province suffit.
      return regionName ?? feature.place_name ?? null;
    }
    if (zoom < 11) {
      // Zoom moyen : "Ville, QC" plutôt que l'adresse précise ou un nom de rue isolé.
      const place = findByPrefix('place') ?? findByPrefix('municipality');
      if (place) return abbr ? `${place}, ${abbr}` : place;
      return regionName ?? feature.text ?? null;
    }
    // Zoom rapproché : ville quand même préférée à un nom de rue isolé, pour rester lisible.
    const place = findByPrefix('place') ?? findByPrefix('municipality') ?? feature.text;
    return abbr ? `${place}, ${abbr}` : place ?? null;
  } catch {
    return null;
  }
}

/** Adresse précise (numéro civique + rue) pour auto-remplir le formulaire de
 * signalement — distinct du repère "où on regarde" ci-dessus, qui reste
 * volontairement moins précis (nom de ville) pour rester lisible.
 *
 * Sur les grandes routes rurales (pas de numéro civique à proximité),
 * MapTiler retourne souvent juste le nom de la route sans la municipalité
 * (ex. "R 116, Canada") — inutilisable pour une municipalité qui recevrait
 * ce signalement. On reconstruit une adresse plus utile en combinant le nom
 * de la route avec la municipalité la plus proche trouvée dans le contexte. */
export interface AddressResult {
  address: string | null;
  /** Nom de municipalité détecté (contexte MapTiler) — utilisé pour associer
   * automatiquement un signalement à la bonne municipalité en attendant
   * l'import de vraies frontières géographiques (voir reports.service.ts). */
  municipality: string | null;
}

export async function reverseGeocodeAddress(lat: number, lng: number): Promise<AddressResult> {
  if (!MAPTILER_KEY) return { address: null, municipality: null };
  try {
    const res = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${MAPTILER_KEY}&language=fr`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) throw new Error('Aucun résultat');

    const municipality = feature.context?.find((c: any) => c.id?.startsWith('municipality') || c.id?.startsWith('place'));
    const region = feature.context?.find((c: any) => c.id?.startsWith('region'));
    const municipalityName = municipality?.text ?? null;

    // A un numéro civique ou une rue claire (ex. "40 Rue Roux") — le
    // place_name de MapTiler est déjà correct pour ce cas.
    if (feature.address || /^\d/.test(feature.text ?? '')) {
      return { address: feature.place_name ?? feature.text ?? null, municipality: municipalityName };
    }

    // Repli de base, toujours calculé avant d'essayer l'amélioration ci-dessous
    // — si l'appel suivant échoue ou est trop lent, on a déjà quelque chose.
    const fallback = [feature.text, municipality?.text, region?.text].filter(Boolean).join(', ') || feature.place_name || null;

    // Pas d'adresse civique exactement à ce point (typique sur une grande
    // route rurale) — on cherche la vraie adresse civique connue la plus
    // proche (interpolation officielle de MapTiler à partir de plages
    // d'adresses réelles, pas une invention de notre part), préfixée
    // "près de" pour être honnête que ce n'est pas la position exacte.
    // Délai limité à 4s pour ne jamais bloquer longtemps sur cette requête
    // secondaire — le repli ci-dessus est déjà prêt si besoin.
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const addrRes = await fetch(
        `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${MAPTILER_KEY}&language=fr&types=address`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      if (addrRes.ok) {
        const addrData = await addrRes.json();
        const addrFeature = addrData.features?.[0];
        const addrCenter = addrFeature?.center; // [lng, lat]
        if (addrFeature?.place_name && addrCenter) {
          const distance = haversineMeters(lat, lng, addrCenter[1], addrCenter[0]);
          // Au-delà de 800m, l'adresse trouvée n'a plus vraiment de lien
          // avec l'endroit signalé — mieux vaut le repli route+municipalité.
          if (distance <= 800) return { address: `près de ${addrFeature.place_name}`, municipality: municipalityName };
        }
      }
    } catch {
      // Repli silencieux sur le nom de route + municipalité ci-dessous.
    }

    return { address: fallback, municipality: municipalityName };
  } catch {
    // Le géocodage principal a complètement échoué (réseau, quota, etc.) —
    // dernier filet de sécurité avec le repère de zone déjà utilisé ailleurs
    // dans l'app, plutôt que de ne rien afficher du tout.
    const areaName = await reverseGeocode(lat, lng, 16);
    return { address: areaName, municipality: null };
  }
}

/** Colle une coordonnée GPS brute sur la route la plus proche — évite que
 * les signalements atterrissent au milieu d'un champ ou d'un bâtiment alors
 * que c'est un problème routier. Utilise le service public de démonstration
 * OSRM (gratuit, mais pas fait pour un très gros volume de production —
 * à auto-héberger si le trafic grandit beaucoup). En cas d'échec, retombe
 * silencieusement sur la coordonnée d'origine. */
export async function snapToRoad(lat: number, lng: number): Promise<{ lat: number; lng: number; snapped: boolean }> {
  try {
    const res = await fetch(`https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}`);
    if (!res.ok) return { lat, lng, snapped: false };
    const data = await res.json();
    const snapped = data.waypoints?.[0]?.location;
    if (!snapped) return { lat, lng, snapped: false };
    return { lat: snapped[1], lng: snapped[0], snapped: true };
  } catch {
    return { lat, lng, snapped: false };
  }
}
