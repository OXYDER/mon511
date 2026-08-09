/**
 * Gabarit HTML partagé pour tous les courriels de mon511.ca — reprend le
 * visuel de l'app (fond sombre, accent orange, logo "511") plutôt que des
 * courriels en texte brut sans identité. Compatible avec les principaux
 * clients courriel (styles en ligne, pas de CSS externe/JS, tables pour la
 * mise en page — les clients courriel ignorent souvent le CSS moderne).
 */
export function renderEmailHtml(params: {
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const { title, bodyHtml, ctaLabel, ctaUrl } = params;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#0A0B0E; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0B0E; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#14161B; border-radius:16px; overflow:hidden; border:1px solid #262932;">

          <!-- En-tête avec le logo -->
          <tr>
            <td style="padding:28px 32px 20px; border-bottom:1px solid #262932;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#FF5A1F; border-radius:8px; padding:6px 10px;">
                    <span style="font-family:Georgia,serif; font-weight:700; font-size:15px; color:#14161B; letter-spacing:0.5px;">511</span>
                  </td>
                  <td style="padding-left:10px; font-family:Georgia,serif; font-weight:600; font-size:16px; color:#F5F6F8;">
                    mon511.ca
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td style="padding:28px 32px;">
              <h1 style="margin:0 0 16px; font-size:19px; font-weight:600; color:#F5F6F8;">${title}</h1>
              <div style="font-size:14px; line-height:1.65; color:#B4B7C0;">
                ${bodyHtml}
              </div>
              ${ctaLabel && ctaUrl ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="background-color:#FF5A1F; border-radius:9px;">
                    <a href="${ctaUrl}" style="display:inline-block; padding:12px 22px; font-size:14px; font-weight:600; color:#14161B; text-decoration:none;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>` : ''}
            </td>
          </tr>

          <!-- Pied de page -->
          <tr>
            <td style="padding:18px 32px 26px; border-top:1px solid #262932;">
              <p style="margin:0; font-size:11.5px; color:#6B6E78; line-height:1.6;">
                mon511.ca — Plateforme communautaire de signalement routier au Québec.<br />
                Une question ? Écris-nous à <a href="mailto:info@mon511.ca" style="color:#FF5A1F; text-decoration:none;">info@mon511.ca</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Convertit le HTML en texte brut approximatif — repli pour les clients
 * courriel qui n'affichent pas le HTML (rare, mais bonne pratique). */
export function stripHtmlForFallback(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
