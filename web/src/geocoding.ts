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

/** Géocodage inverse — retourne le nom du lieu (ville/quartier) le plus
 * proche d'une coordonnée, pour afficher "où on regarde" sur la carte. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!MAPTILER_KEY) return null;
  try {
    const res = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${MAPTILER_KEY}&language=fr`);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    // Préfère un nom court (ville/municipalité) plutôt que l'adresse complète.
    const place = feature.context?.find((c: any) => c.id?.startsWith('place') || c.id?.startsWith('municipality'));
    return place?.text ?? feature.text ?? feature.place_name ?? null;
  } catch {
    return null;
  }
}
