import piexif from 'piexifjs';

function blobToBinaryString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsBinaryString est dépréciée mais reste largement supportée ;
      // c'est le format exact dont piexifjs a besoin (une chaîne où
      // chaque caractère représente un octet).
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsBinaryString(blob);
  });
}

function binaryStringToBlob(binaryString: string, mimeType: string): Blob {
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: mimeType });
}

/** Compresse une image côté navigateur avant l'envoi — réduit le poids
 * sur le disque tout en gardant une qualité visuelle très proche de
 * l'originale. Redimensionne au besoin (les photos de téléphone dépassent
 * souvent largement ce qui est utile à l'écran) et réencode en JPEG à un
 * taux de qualité élevé.
 *
 * IMPORTANT : le réencodage via <canvas> retire TOUJOURS les métadonnées
 * EXIF (position GPS, date de prise, appareil) — c'est une limitation du
 * navigateur, pas un choix. Le serveur se fie à l'EXIF du fichier REÇU
 * pour vérifier l'authenticité d'un signalement (volontairement, pour ne
 * jamais faire confiance à des valeurs envoyées par le client) — sans
 * réinsertion, TOUTE photo compressée perdait son EXIF et devenait "non
 * vérifiable" en modération, peu importe si elle était authentique.
 * piexifjs réinsère les vraies données EXIF de l'original dans le fichier
 * compressé après coup, pour que le serveur retrouve exactement les
 * mêmes informations qu'avant compression. */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  // Rien à gagner à compresser un GIF (perdrait l'animation) ou un fichier
  // déjà petit — on le laisse passer tel quel (EXIF intact par définition).
  if (file.type === 'image/gif' || file.size < 200_000) return file;

  // Extrait l'EXIF de l'ORIGINAL avant toute compression — si le fichier
  // n'a pas d'EXIF exploitable (capture d'écran, photo déjà nettoyée,
  // etc.), on continue sans, exactement comme avant cette fonctionnalité.
  let exifBytes: string | null = null;
  try {
    const originalBinaryString = await blobToBinaryString(file);
    const exifObj = piexif.load(originalBinaryString);
    exifBytes = piexif.dump(exifObj);
  } catch {
    exifBytes = null;
  }

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
        async (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob || blob.size >= file.size) {
            // La compression n'a pas aidé — on garde l'original (EXIF
            // toujours intact dans ce cas, rien à réinsérer).
            resolve(file);
            return;
          }

          const compressedName = file.name.replace(/\.\w+$/, '') + '.jpg';

          if (!exifBytes) {
            resolve(new File([blob], compressedName, { type: 'image/jpeg' }));
            return;
          }

          try {
            const compressedBinaryString = await blobToBinaryString(blob);
            const withExifBinaryString = piexif.insert(exifBytes!, compressedBinaryString);
            const finalBlob = binaryStringToBlob(withExifBinaryString, 'image/jpeg');
            resolve(new File([finalBlob], compressedName, { type: 'image/jpeg' }));
          } catch {
            // La réinsertion a échoué pour une raison quelconque — mieux
            // vaut envoyer la photo compressée sans EXIF (juste "non
            // vérifiable" en modération) que de bloquer l'envoi au complet.
            resolve(new File([blob], compressedName, { type: 'image/jpeg' }));
          }
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}
