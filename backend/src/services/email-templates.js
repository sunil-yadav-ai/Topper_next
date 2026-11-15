function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createResourceUploadEmail({
  studentName,
  resourceName,
  category,
  status,
  uploadedAt,
}) {
  const text = [
    `Hi ${studentName},`,
    "",
    "Your upload was received successfully.",
    `Resource: ${resourceName}`,
    `Category: ${category}`,
    `Status: ${status}`,
    `Uploaded: ${uploadedAt}`,
    "",
    "Thanks for contributing to the Topper learning community.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172554">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
          <tr><td style="padding:24px 32px;background:#123b73;color:#fff;font-size:22px;font-weight:700">Topper</td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 12px;font-size:18px">Hi ${escapeHtml(studentName)},</p>
            <h1 style="margin:0 0 16px;font-size:24px">Upload confirmed</h1>
            <p style="margin:0 0 24px;color:#475569;line-height:1.6">Your resource was uploaded successfully. Thank you for helping other students learn.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
              <tr><td style="padding:16px 18px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px">Resource</td></tr>
              <tr><td style="padding:0 18px 14px;font-size:17px;font-weight:700">${escapeHtml(resourceName)}</td></tr>
              <tr><td style="padding:0 18px 8px;color:#475569">Category: ${escapeHtml(category)}</td></tr>
              <tr><td style="padding:0 18px 8px;color:#475569">Status: ${escapeHtml(status)}</td></tr>
              <tr><td style="padding:0 18px 16px;color:#475569">Uploaded: ${escapeHtml(uploadedAt)}</td></tr>
            </table>
            <p style="margin:24px 0 0;color:#475569;line-height:1.6">We appreciate your contribution to the Topper learning community.</p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#f8fafc;color:#64748b;font-size:12px">Topper · Learn and grow together</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

export function createBrandedEmail({ subject, text }) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172554">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
          <tr><td style="padding:24px 32px;background:#123b73;color:#fff;font-size:22px;font-weight:700">Topper</td></tr>
          <tr><td style="padding:32px">
            <h1 style="margin:0 0 20px;font-size:22px">${escapeHtml(subject)}</h1>
            <div style="color:#475569;line-height:1.7;white-space:pre-line">${escapeHtml(text)}</div>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#f8fafc;color:#64748b;font-size:12px">Topper · Learn and grow together</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
