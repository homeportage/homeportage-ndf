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

  const { nom, prenom, debut, fin, isElec, rows, kmNb, kmRate, kmResult, totHt, totTva, totTtc, signature } = data;
  const today = new Date().toLocaleDateString('fr-FR');

  // Extraire le base64 de la signature
  const sigBase64 = signature ? signature.replace(/^data:image\/png;base64,/, '') : null;

  const sections = [
    { title: 'FRAIS DE FONCTIONNEMENT', labels: ['Publicité','Téléphone','Fournitures administratives','Frais annuels / uniques (RCP, TPE...)','Location local','Confort véhicule'] },
    { title: 'FRAIS DU PORTÉ', labels: ['Repas','Pressing','Vêtements (1 tenue/an)','Coiffeur'] },
    { title: 'FRAIS DE DÉPLACEMENT', labels: ['Avion / Train / Hôtel','Parking / Autoroute / Lavage','Frais réels véhicule'] }
  ];

  function buildSectionRows(labels) {
    return labels.map((label, i) => {
      const row = rows.find(r => r.label === label) || { ht: 0, tva: 0, ttc: 0 };
      const ht = parseFloat(row.ht) || 0;
      const tva = parseFloat(row.tva) || 0;
      const ttc = parseFloat(row.ttc) || 0;
      const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
      return `<tr style="background:${bg};">
        <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;">${label}</td>
        <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${ht > 0 ? ht.toFixed(2)+' €' : ''}</td>
        <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${tva > 0 ? tva.toFixed(2)+' €' : ''}</td>
        <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${ttc > 0 ? ttc.toFixed(2)+' €' : ''}</td>
      </tr>`;
    }).join('');
  }

  function buildSection(title, labels) {
    return `<tr><td colspan="4" style="background:#e8e8e8;padding:8px 10px;font-size:11px;font-weight:bold;color:#444;letter-spacing:0.8px;">${title}</td></tr>${buildSectionRows(labels)}`;
  }

  const autresRow = rows.find(r => r.label === 'autres');
  const autresHt = autresRow ? parseFloat(autresRow.ht) || 0 : 0;
  const autresSection = autresHt > 0 ? `
    <tr><td colspan="4" style="background:#e8e8e8;padding:8px 10px;font-size:11px;font-weight:bold;color:#444;letter-spacing:0.8px;">AUTRES</td></tr>
    <tr style="background:#ffffff;">
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;">${autresRow.labelText || 'Autre'}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${autresHt.toFixed(2)} €</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${(parseFloat(autresRow.tva)||0).toFixed(2)} €</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${(parseFloat(autresRow.ttc)||0).toFixed(2)} €</td>
    </tr>` : '';

  const kmSection = `
    <tr><td colspan="4" style="background:#e8e8e8;padding:8px 10px;font-size:11px;font-weight:bold;color:#444;letter-spacing:0.8px;">INDEMNITÉS KILOMÉTRIQUES</td></tr>
    <tr style="background:#ffffff;">
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;">${kmNb > 0 ? kmNb+' km × '+kmRate+' €/km'+(isElec?' (⚡ électrique +20%)':'') : '—'}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${kmNb > 0 ? parseFloat(kmResult).toFixed(2)+' €' : ''}</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">Ø</td>
      <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid #f0f0f0;text-align:right;">${kmNb > 0 ? parseFloat(kmResult).toFixed(2)+' €' : ''}</td>
    </tr>`;

  const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;background:#f4f4f4;">
<div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <div style="background:#00B4A0;padding:24px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;letter-spacing:1px;">NOTE DE FRAIS</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:12px;">Tous les frais doivent être directement liés à votre activité</p>
  </div>

  <div style="padding:20px;">

    <table style="width:100%;background:#f5f5f5;border-radius:6px;margin-bottom:20px;border-collapse:collapse;">
      <tr><td style="padding:10px 14px;font-size:13px;"><strong>NOM & PRÉNOM :</strong> ${prenom} ${nom}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;border-top:1px solid #eee;"><strong>PÉRIODE :</strong> Du ${debut} au ${fin}</td></tr>
      ${isElec ? `<tr><td style="padding:10px 14px;font-size:13px;border-top:1px solid #eee;color:#0a6b58;"><strong>⚡ Véhicule électrique — majoration barème +20% appliquée</strong></td></tr>` : ''}
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e5e5e5;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="padding:9px 10px;text-align:left;font-size:11px;color:#666;">LIBELLÉ</th>
          <th style="padding:9px 10px;text-align:right;font-size:11px;color:#666;">H.T. (€)</th>
          <th style="padding:9px 10px;text-align:right;font-size:11px;color:#666;">TVA (€)</th>
          <th style="padding:9px 10px;text-align:right;font-size:11px;color:#666;">T.T.C (€)</th>
        </tr>
      </thead>
      <tbody>
        ${sections.map(s => buildSection(s.title, s.labels)).join('')}
        ${kmSection}
        ${autresSection}
      </tbody>
      <tfoot>
        <tr style="background:#00B4A0;">
          <td style="padding:11px 10px;color:white;font-weight:bold;font-size:14px;text-decoration:underline;">TOTAL</td>
          <td style="padding:11px 10px;color:white;font-weight:bold;font-size:14px;text-align:right;">${parseFloat(totHt).toFixed(2)} €</td>
          <td style="padding:11px 10px;color:white;font-weight:bold;font-size:14px;text-align:right;">${parseFloat(totTva).toFixed(2)} €</td>
          <td style="padding:11px 10px;color:white;font-weight:bold;font-size:14px;text-align:right;">${parseFloat(totTtc).toFixed(2)} €</td>
        </tr>
      </tfoot>
    </table>

    <!-- SIGNATURE -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="font-size:13px;font-weight:bold;padding-bottom:8px;">DATE & SIGNATURE :</td></tr>
      <tr><td style="font-size:12px;color:#666;padding-bottom:10px;">Fait le ${today} par ${prenom} ${nom}</td></tr>
      <tr>
        <td>
          <div style="border:2px solid #00B4A0;border-radius:6px;padding:6px;display:inline-block;background:#fafafa;">
            <img src="cid:signature" style="display:block;height:90px;max-width:280px;" alt="Signature ${prenom} ${nom}">
          </div>
        </td>
      </tr>
    </table>

    <p style="font-size:11px;color:#aaa;text-align:center;border-top:1px solid #f0f0f0;padding-top:14px;margin:0;">
      Document généré automatiquement — ${prenom} ${nom} — ${today} — Home Portage<br>
      Conservez vos justificatifs de frais en cas de contrôle fiscal.
    </p>

  </div>
</div>
</body>
</html>`;

  try {
    const emailPayload = {
      from: 'Notes de Frais <frais@homeportage.fr>',
      to: ['contact@homeportage.fr'],
      subject: `Note de frais — ${prenom} ${nom} — du ${debut} au ${fin}`,
      html: emailHtml,
    };

    // Ajouter la signature comme pièce jointe inline
    if (sigBase64) {
      emailPayload.attachments = [
        {
          filename: 'signature.png',
          content: sigBase64,
          content_id: 'signature',
          inline: true,
        }
      ];
    }

    await resend.emails.send(emailPayload);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('Resend error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
