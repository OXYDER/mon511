const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

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

    if (zoom < 7) {
      // Très dézoomé : la province suffit.
      return findByPrefix('region') ?? feature.place_name ?? null;
    }
    if (zoom < 11) {
      // Zoom moyen : municipalité/ville plutôt que l'adresse précise.
      return findByPrefix('place') ?? findByPrefix('municipality') ?? findByPrefix('region') ?? feature.text ?? null;
    }
    // Zoom rapproché : le lieu le plus précis retourné par MapTiler.
    return feature.text ?? feature.place_name ?? null;
  } catch {
    return null;
  }
}
