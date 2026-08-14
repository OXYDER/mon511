/** Formate le nom d'affichage d'un usager selon ses propres préférences de
 * confidentialité (users.privacy_settings.last_name_display) — utilisé
 * partout où le nom d'un usager doit être montré à quelqu'un d'autre
 * (profil public, messagerie, etc.), pour rester cohérent peu importe
 * l'endroit. */
export function formatDisplayName(
  firstName: string | null,
  lastName: string | null,
  lastNameDisplay: string | undefined,
  fallbackEmail: string,
): string {
  const first = firstName || fallbackEmail.split('@')[0];
  if (!lastName || lastNameDisplay === 'hidden' || !lastNameDisplay) return first;
  if (lastNameDisplay === 'initial') return `${first} ${lastName[0].toUpperCase()}.`;
  return `${first} ${lastName}`;
}
