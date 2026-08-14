/** Compresse une image côté navigateur avant l'envoi — réduit le poids
 * sur le disque tout en gardant une qualité visuelle très proche de
 * l'originale. Redimensionne au besoin (les photos de téléphone dépassent
 * souvent largement ce qui est utile à l'écran) et réencode en JPEG à un
 * taux de qualité élevé.
 *
 * IMPORTANT : ne touche jamais au fichier ORIGINAL — l'extraction EXIF
 * (position GPS de la photo) doit toujours se faire sur le fichier tel que
 * choisi par l'usager, avant tout appel à cette fonction, puisque
 * l'encodage via <canvas> retire les métadonnées EXIF.
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  // Rien à gagner à compresser un GIF (perdrait l'animation) ou un fichier
  // déjà petit — on le laisse passer tel quel.
  if (file.type === 'image/gif' || file.size < 200_000) return file;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(objectUrl); resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob || blob.size >= file.size) {
            // La compression n'a pas aidé (rare, mais possible sur une
            // image déjà bien optimisée) — on garde l'original plutôt que
            // d'envoyer quelque chose de plus gros.
            resolve(file);
            return;
          }
          const compressedName = file.name.replace(/\.\w+$/, '') + '.jpg';
          resolve(new File([blob], compressedName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}
