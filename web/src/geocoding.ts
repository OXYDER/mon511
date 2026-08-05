const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

export interface GeocodingResult {
  name: string;
  lat: number;
  lng: number;
}

/** Recherche une ville/adresse au Québec via MapTiler. Retourne null si pas
 * de clé configurée ou aucun résultat — l'appelant retombe alors sur la
 * recherche textuelle locale uniquement. */
export async function searchCity(query: string): Promise<GeocodingResult | null> {
  if (!MAPTILER_KEY || !query.trim()) return null;
  try {
    const res = await fetch(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&country=ca&limit=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.center;
    return { name: feature.place_name, lat, lng };
  } catch {
    return null;
  }
}
