import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { reverseGeocodeAddress, snapToRoad, searchCities, GeocodingResult } from '../geocoding';
import { pickName } from '../i18n';
import { compressImage } from '../imageCompression';

interface ProblemType {
  id: string;
  nameFr: string;
  nameEn?: string;
  icon: string | null;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
  initialCoords?: { lat: number; lng: number } | null;
  lang: 'fr' | 'en';
}

export default function CreateReportModal({ onClose, onCreated, initialCoords, lang }: Props) {
  const [types, setTypes] = useState<ProblemType[]>([]);
  const [typeId, setTypeId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [addressText, setAddressText] = useState('');
  const [addressAutoFilled, setAddressAutoFilled] = useState(false);
  const [detectedMunicipality, setDetectedMunicipality] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [snappedToRoad, setSnappedToRoad] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodingResult[]>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [municipalityNotified, setMunicipalityNotified] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [municipalityName, setMunicipalityName] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);
  const [submittedSummary, setSubmittedSummary] = useState<{ typeName: string; typeIcon: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const MAX_PHOTOS = 3;
  const [exifMismatch, setExifMismatch] = useState<{ exifAddress: string; exifMunicipality: string | null; exifCoords: { lat: number; lng: number } } | null>(null);
  const [checkingExif, setCheckingExif] = useState(false);
  const [photoExifCoords, setPhotoExifCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [usedPhotoLocation, setUsedPhotoLocation] = useState(false);
  const [archivedMatches, setArchivedMatches] = useState<any[]>([]);
  const [dismissedArchiveMatch, setDismissedArchiveMatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Affiche le bouton « Appareil photo » seulement sur mobile — sur PC, un
  // appareil photo intégré n'a pas vraiment de sens pour ce cas d'usage,
  // et l'attribut capture n'a de toute façon aucun effet sur ces navigateurs.
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    api.get<any[]>('/problem-types').then((data) => {
      setTypes(data.map((t) => ({ id: t.id, nameFr: t.name_fr, nameEn: t.name_en, icon: t.icon })));
      if (data[0]) setTypeId(data[0].id);
    });
  }, []);

  // Coordonnées venant d'un clic direct sur la carte — collées sur la route
  // et l'adresse auto-remplie, comme pour la géolocalisation.
  useEffect(() => {
    if (!initialCoords) return;
    (async () => {
      const { lat, lng, snapped } = await snapToRoad(initialCoords.lat, initialCoords.lng);
      setCoords({ lat, lng, accuracy: 15 });
      setSnappedToRoad(snapped);
      const geo = await reverseGeocodeAddress(lat, lng);
      if (geo.address) { setAddressText(geo.address); setAddressAutoFilled(true); setUsedPhotoLocation(false); }
      if (geo.municipality) setDetectedMunicipality(geo.municipality);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Détection de doublons : un signalement archivé existe-t-il déjà tout
  // près? Si oui, on propose de réutiliser ses informations plutôt que de
  // tout ressaisir depuis zéro.
  useEffect(() => {
    if (!coords) return;
    api.get<any[]>(`/reports/nearby-existing?lat=${coords.lat}&lng=${coords.lng}`)
      .then(setArchivedMatches)
      .catch(() => setArchivedMatches([]));
  }, [coords]);

  async function confirmExistingInstead(reportId: string) {
    try {
      await api.post(`/reports/${reportId}/confirm`);
      setDismissedArchiveMatch(true);
      onClose();
    } catch {
      // Déjà confirmé ou erreur réseau — l'usager peut simplement continuer
      // avec son propre signalement dans ce cas, pas la peine de bloquer.
    }
  }

  function useArchivedMatch(match: any) {
    setTypeId(match.problemTypeId);
    if (match.description) setDescription(match.description);
    setDismissedArchiveMatch(true);
  }

  // Suggestions d'adresse pendant la frappe manuelle — n'écrase pas les
  // coordonnées tant que rien n'est choisi dans la liste.
  useEffect(() => {
    if (addressAutoFilled || !addressText.trim() || addressText.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchCities(addressText, 5).then(setAddressSuggestions);
    }, 350);
    return () => clearTimeout(timeout);
  }, [addressText, addressAutoFilled]);

  async function selectAddressSuggestion(result: GeocodingResult) {
    const { lat, lng, snapped } = await snapToRoad(result.lat, result.lng);
    setCoords({ lat, lng, accuracy: 15 });
    setSnappedToRoad(snapped);
    setAddressText(result.name);
    // Choisir dans la liste déroulante reste un choix de l'usager, pas une
    // détection GPS — le message affiché doit rester « entrée manuellement »
    // même dans ce cas, pas « position précise capturée ».
    setAddressAutoFilled(false);
    setUsedPhotoLocation(false);
    if (result.municipality) setDetectedMunicipality(result.municipality);
    setShowAddressDropdown(false);
    setAddressSuggestions([]);
  }

  async function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const raw = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Colle sur la route la plus proche — un signalement routier doit
        // apparaître sur la chaussée, pas au milieu d'un champ ou d'un
        // bâtiment à cause de l'imprécision naturelle du GPS.
        const { lat, lng, snapped } = await snapToRoad(raw.lat, raw.lng);
        const c = { lat, lng, accuracy: pos.coords.accuracy };
        setCoords(c);
        setLocating(false);
        setSnappedToRoad(snapped);
        // Ici, contrairement au remplissage automatique à l'ouverture du
        // formulaire, l'usager vient de cliquer explicitement sur ce
        // bouton — il s'attend à ce que l'adresse affichée reflète la
        // position tout juste détectée, même s'il avait déjà tapé
        // quelque chose manuellement avant.
        const geo = await reverseGeocodeAddress(c.lat, c.lng);
        if (geo.address) { setAddressText(geo.address); setAddressAutoFilled(true); setUsedPhotoLocation(false); }
        if (geo.municipality) setDetectedMunicipality(geo.municipality);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    e.target.value = ''; // permet de resélectionner le même fichier plus tard

    const wasEmpty = photoFiles.length === 0;
    const room = MAX_PHOTOS - photoFiles.length;
    const accepted = selected.slice(0, room);

    setPhotoFiles((prev) => [...prev, ...accepted]);
    setPhotoPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    setExifMismatch(null);

    // Vérification EXIF seulement sur la toute première photo ajoutée —
    // pas la peine de re-vérifier à chaque photo supplémentaire.
    if (!wasEmpty || accepted.length === 0) return;
    const file = accepted[0];

    setCheckingExif(true);
    try {
      const exifr = (await import('exifr')).default;
      const gps = await exifr.gps(file);
      if (gps?.latitude && gps?.longitude) {
        setPhotoExifCoords({ lat: gps.latitude, lng: gps.longitude });
        const geo = await reverseGeocodeAddress(gps.latitude, gps.longitude);
        if (geo.address && coords) {
          // Écart significatif (~500m+) entre la photo et la position détectée.
          const distance = haversine(coords.lat, coords.lng, gps.latitude, gps.longitude);
          if (distance > 500) {
            setExifMismatch({ exifAddress: geo.address, exifMunicipality: geo.municipality, exifCoords: { lat: gps.latitude, lng: gps.longitude } });
          }
        } else if (geo.address && !coords) {
          // Aucune position détectée encore — propose directement celle de la photo.
          setExifMismatch({ exifAddress: geo.address, exifMunicipality: geo.municipality, exifCoords: { lat: gps.latitude, lng: gps.longitude } });
        }
      }
    } catch {
      // Pas de GPS dans l'EXIF ou format non lisible — pas grave, on continue sans.
    } finally {
      setCheckingExif(false);
    }
  }

  // Revérifie l'écart avec la photo à chaque changement de position — pas
  // seulement au moment d'ajouter la photo. Sans ça, modifier l'adresse
  // manuellement APRÈS avoir ajouté une photo ne redéclenchait jamais
  // l'avertissement, même si la nouvelle adresse s'éloigne de la photo.
  useEffect(() => {
    if (!photoExifCoords || !coords) return;
    const distance = haversine(coords.lat, coords.lng, photoExifCoords.lat, photoExifCoords.lng);
    if (distance > 500) {
      reverseGeocodeAddress(photoExifCoords.lat, photoExifCoords.lng).then((geo) => {
        if (geo.address) {
          setExifMismatch({ exifAddress: geo.address, exifMunicipality: geo.municipality, exifCoords: photoExifCoords });
        }
      });
    } else {
      setExifMismatch(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, photoExifCoords]);

  function removePhoto(index: number) {
    setPhotoFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) { setPhotoExifCoords(null); setExifMismatch(null); }
      return next;
    });
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function useExifLocation() {
    if (!exifMismatch) return;
    const { lat, lng, snapped } = await snapToRoad(exifMismatch.exifCoords.lat, exifMismatch.exifCoords.lng);
    setCoords({ lat, lng, accuracy: 15 });
    setSnappedToRoad(snapped);
    setAddressText(exifMismatch.exifAddress);
    setAddressAutoFilled(true);
    setUsedPhotoLocation(true);
    if (exifMismatch.exifMunicipality) setDetectedMunicipality(exifMismatch.exifMunicipality);
    setExifMismatch(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError("Utilise le bouton de localisation avant d'envoyer le signalement.");
      return;
    }
    if (photoFiles.length === 0) {
      setError('Ajoute au moins une photo pour appuyer ton signalement.');
      return;
    }
    setSubmitting(true);
    setSubmitProgress('Création du signalement...');
    setError(null);
    try {
      const report = await api.post<{ id: string }>('/reports', {
        problemTypeId: typeId,
        latitude: coords.lat,
        longitude: coords.lng,
        gpsAccuracyM: coords.accuracy,
        addressText: addressText || undefined,
        description: description || undefined,
        municipalityNotified,
        municipalityName: municipalityNotified === 'yes' ? municipalityName || undefined : undefined,
        municipalityHint: detectedMunicipality || undefined,
      });

      if (photoFiles.length > 0 && report?.id) {
        for (let i = 0; i < photoFiles.length; i++) {
          setSubmitProgress(
            photoFiles.length > 1
              ? `Envoi de la photo ${i + 1} sur ${photoFiles.length}...`
              : 'Envoi de la photo...',
          );
          // Compression appliquée seulement ici, juste avant l'envoi —
          // jamais sur le fichier original (celui déjà utilisé plus haut
          // pour l'extraction EXIF au moment de la sélection).
          const compressed = await compressImage(photoFiles[i]);
          const formData = new FormData();
          formData.append('file', compressed);
          await api.post(`/reports/${report.id}/photos`, formData).catch(() => {
            // Le signalement est déjà créé — un échec d'upload ne doit pas bloquer l'usager.
          });
        }
      }

      const chosenType = types.find((t) => t.id === typeId);
      setSubmittedSummary({ typeName: pickName(chosenType?.nameFr ?? 'Signalement', chosenType?.nameEn, lang), typeIcon: chosenType?.icon ?? '📍' });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le signalement.");
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) (submittedSummary ? onCreated() : onClose()); }}>
      <div className="modal-box">
        <div className="modal-head">
          <div className="modal-title">{submittedSummary ? 'Signalement envoyé' : 'Nouveau signalement'}</div>
          <button className="modal-close" onClick={() => (submittedSummary ? onCreated() : onClose())}>✕</button>
        </div>
        <div className="modal-body">
          {submittedSummary ? (
            <>
              <div className="success-banner" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <span>Merci ! Ton signalement a bien été envoyé.</span>
              </div>

              <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 14, marginTop: 4, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>
                  <span>{submittedSummary.typeIcon}</span>
                  <span>{submittedSummary.typeName}</span>
                </div>
                {description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>{description}</div>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>📍 {addressText || 'Position GPS'}</span>
                  {municipalityNotified === 'yes' && (
                    <span>🏛️ Municipalité avisée{municipalityName ? ` — ${municipalityName}` : ''}</span>
                  )}
                  {photoFiles.length > 0 && <span>📷 {photoFiles.length} photo{photoFiles.length > 1 ? 's' : ''} jointe{photoFiles.length > 1 ? 's' : ''}</span>}
                </div>
              </div>

              <button className="btn-primary" onClick={onCreated}>Voir sur la carte</button>
            </>
          ) : (
          <>
          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={submit}>

            <div className="field-group">
              <label className="field-label">Type de problème</label>
              <div className="type-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {types.map((t) => (
                  <div
                    key={t.id}
                    className={`type-option ${typeId === t.id ? 'active' : ''}`}
                    onClick={() => setTypeId(t.id)}
                  >
                    <span className="ti">{t.icon ?? '📍'}</span>
                    <span>{pickName(t.nameFr, t.nameEn, lang)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Photos (au moins 1 requise — max {MAX_PHOTOS})</label>
              {photoPreviews.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {photoPreviews.map((src, i) => (
                    <div key={src} style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
                      <img src={src} alt="Aperçu" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 9 }} />
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removePhoto(i)}
                        style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, fontSize: 10 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photoFiles.length < MAX_PHOTOS && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1, border: '1.5px dashed var(--panel-border)', borderRadius: 10, padding: '20px 10px',
                      textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    🖼️ {photoFiles.length === 0 ? 'Sélectionner une photo' : `Sélectionner une autre photo (${photoFiles.length}/${MAX_PHOTOS})`}
                  </div>
                  {isMobileDevice && (
                    <div
                      onClick={() => cameraInputRef.current?.click()}
                      style={{
                        flex: 1, border: '1.5px dashed var(--panel-border)', borderRadius: 10, padding: '20px 10px',
                        textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      📷 Appareil photo
                    </div>
                  )}
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: 'none' }} />
              {isMobileDevice && (
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ display: 'none' }} />
              )}
              {checkingExif && <div className="geo-status">Vérification de la position de la photo...</div>}
              {exifMismatch && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 9, background: 'var(--accent-signal-dim)', border: '1px solid var(--accent-signal)' }}>
                  <div style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }}>
                    📍 Cette photo semble avoir été prise à <strong>{exifMismatch.exifAddress}</strong>, différent de la position détectée. Utiliser l'emplacement de la photo ?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-ghost" onClick={useExifLocation} style={{ flex: 1 }}>Oui</button>
                    <button type="button" className="btn-ghost" onClick={() => setExifMismatch(null)} style={{ flex: 1 }}>Non</button>
                  </div>
                </div>
              )}
            </div>

            <div className="field-group" style={{ position: 'relative' }}>
              <label className="field-label">Localisation</label>
              <div className="geo-btn-row">
                <input
                  className="text-input"
                  placeholder="Adresse ou repère"
                  value={addressText}
                  onChange={(e) => { setAddressText(e.target.value); setAddressAutoFilled(false); setUsedPhotoLocation(false); setShowAddressDropdown(true); }}
                  onFocus={() => setShowAddressDropdown(true)}
                  onBlur={() => setTimeout(() => setShowAddressDropdown(false), 150)}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={locate}
                  disabled={locating}
                  style={{ flexShrink: 0, width: 44 }}
                  title="Utiliser ma position actuelle"
                >
                  {locating ? '⏳' : '🎯'}
                </button>
              </div>
              {showAddressDropdown && addressSuggestions.length > 0 && (
                <div className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 44 + 8, zIndex: 10 }}>
                  {addressSuggestions.map((s) => (
                    <div key={s.name} className="search-dropdown-item" onClick={() => selectAddressSuggestion(s)}>
                      <span>📍</span><span>{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {coords && (
                <div className="geo-status ok">
                  {usedPhotoLocation ? (
                    "Position adaptée aux données GPS d'où la photo a été prise."
                  ) : addressAutoFilled ? (
                    <>
                      Position précise capturée — précision ±{Math.round(coords.accuracy)} m
                      {snappedToRoad && ' · alignée sur la route'}
                      {' · adresse détectée automatiquement'}
                    </>
                  ) : (
                    'Adresse entrée manuellement — assurez-vous que celle-ci est la plus précise possible.'
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Vous pouvez modifier cette adresse si inexacte.
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Description</label>
              <textarea rows={3} placeholder="Décrivez le problème observé..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="field-group">
              <label className="field-label">La municipalité a-t-elle été avisée ?</label>
              <select value={municipalityNotified} onChange={(e) => setMunicipalityNotified(e.target.value as any)}>
                <option value="unknown">Je ne sais pas</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
              {municipalityNotified === 'yes' && (
                <input
                  className="text-input"
                  style={{ marginTop: 8 }}
                  placeholder="Ex. Ville de Sherbrooke"
                  value={municipalityName}
                  onChange={(e) => setMunicipalityName(e.target.value)}
                />
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                Aide à prioriser les cas déjà signalés aux autorités.
              </div>
            </div>

            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="spinner-inline" />
                  {submitProgress ?? 'Envoi...'}
                </span>
              ) : (
                'Envoyer le signalement'
              )}
            </button>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Distance approximative en mètres entre deux points (haversine). */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
