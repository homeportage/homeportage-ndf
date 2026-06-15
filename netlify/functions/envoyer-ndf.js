const { Resend } = require('resend');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    nom, prenom, debut, fin, isElec,
    rows, kmNb, kmRate, kmResult,
    totHt, totTva, totTtc,
    signature
  } = data;

  const today = new Date().toLocaleDateString('fr-FR');

  // Génération HTML du PDF inline
  const rowsHtml = rows.map(r => {
    if (!r.ht || parseFloat(r.ht) === 0) return '';
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${r.labelText || r.label}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${parseFloat(r.ht).toFixed(2)} €</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${parseFloat(r.tva).toFixed(2)} €</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${parseFloat(r.ttc).toFixed(2)} €</td>
    </tr>`;
  }).join('');

  const kmHtml = kmNb > 0 ? `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${kmNb} km × ${kmRate} €/km${isElec ? ' (électrique +20%)' : ''}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${parseFloat(kmResult).toFixed(2)} €</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">0.00 €</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${parseFloat(kmResult).toFixed(2)} €</td>
  </tr>` : '';

  const emailHtml = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><title>Note de Frais</title></head>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;">
      
      <div style="background:#00B4A0;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;letter-spacing:1px;">NOTE DE FRAIS</h1>
        <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">Tous les frais doivent être directement liés à votre activité</p>
      </div>

      <div style="border:1px solid #e5e5e5;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        
        <table style="width:100%;background:#f5f5f5;border-radius:6px;margin-bottom:20px;">
          <tr>
            <td style="padding:10px 14px;font-size:13px;"><strong>NOM & PRÉNOM :</strong> ${prenom} ${nom}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:13px;border-top:1px solid #eee;"><strong>PÉRIODE :</strong> Du ${debut} au ${fin}</td>
          </tr>
          ${isElec ? `<tr><td style="padding:10px 14px;font-size:13px;border-top:1px solid #eee;color:#0a6b58;"><strong>⚡ Véhicule électrique — majoration barème +20% appliquée</strong></td></tr>` : ''}
        </table>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:8px;text-align:left;font-size:12px;color:#666;">LIBELLÉ</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#666;">H.T. (€)</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#666;">TVA (€)</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#666;">T.T.C (€)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${kmHtml}
          </tbody>
          <tfoot>
            <tr style="background:#00B4A0;">
              <td style="padding:10px 8px;color:white;font-weight:bold;font-size:14px;">TOTAL</td>
              <td style="padding:10px 8px;color:white;font-weight:bold;font-size:14px;text-align:right;">${parseFloat(totHt).toFixed(2)} €</td>
              <td style="padding:10px 8px;color:white;font-weight:bold;font-size:14px;text-align:right;">${parseFloat(totTva).toFixed(2)} €</td>
              <td style="padding:10px 8px;color:white;font-weight:bold;font-size:14px;text-align:right;">${parseFloat(totTtc).toFixed(2)} €</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top:24px;border-top:1px solid #eee;padding-top:16px;">
          <p style="font-size:13px;margin-bottom:8px;"><strong>DATE & SIGNATURE :</strong> Fait le ${today}</p>
          <div style="border:2px solid #00B4A0;border-radius:6px;padding:4px;display:inline-block;">
            <img src="${signature}" style="max-width:300px;height:80px;display:block;" alt="Signature de ${prenom} ${nom}">
          </div>
        </div>

        <p style="margin-top:20px;font-size:11px;color:#aaa;text-align:center;">
          Document généré automatiquement — ${prenom} ${nom} — ${today} — Home Portage
        </p>
      </div>
    </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: 'Notes de Frais <frais@homeportage.fr>',
      to: ['contact@homeportage.fr'],
      subject: `Note de frais — ${prenom} ${nom} — du ${debut} au ${fin}`,
      html: emailHtml,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('Resend error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
