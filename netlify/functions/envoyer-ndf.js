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

  // HTML complet pour la pièce jointe (imprimable en PDF)
  const pdfHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>NDF_${nom}_${prenom}_${debut}_${fin}</title>
<style>
  @page { size: A4; margin: 15mm; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .no-print { display: none; } }
  body { font-family: Arial, sans-serif; max-width: 750px; margin: 0 auto; padding: 20px; color: #333; }
  .header { background: #00B4A0; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
  .header h1 { color: white; margin: 0; font-size: 22px; }
  .header p { color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 12px; }
  .content { border: 1px solid #e5e5e5; border-top: none; padding: 20px; border-radius: 0 0 8px 8px; }
  .info-box { background: #f5f5f5; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; }
  .info-box p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f0f0f0; padding: 9px 10px; text-align: left; font-size: 11px; color: #666; }
  th:not(:first-child) { text-align: right; }
  .section-header td { background: #e8e8e8; padding: 8px 10px; font-size: 11px; font-weight: bold; color: #444; letter-spacing: 0.8px; }
  .total-row td { background: #00B4A0; color: white; font-weight: bold; font-size: 14px; padding: 11px 10px; }
  .total-row td:not(:first-child) { text-align: right; }
  .sig-box { border: 2px solid #00B4A0; border-radius: 6px; padding: 6px; display: inline-block; background: #fafafa; }
  .print-btn { background: #00B4A0; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>

  <div class="header">
    <h1>NOTE DE FRAIS</h1>
    <p>Tous les frais doivent être directement liés à votre activité</p>
  </div>

  <div class="content">
    <div class="info-box">
      <p><strong>NOM & PRÉNOM :</strong> ${prenom} ${nom}</p>
      <p><strong>PÉRIODE :</strong> Du ${debut} au ${fin}</p>
      ${isElec ? `<p style="color:#0a6b58;"><strong>⚡ Véhicule électrique — majoration barème +20% appliquée</strong></p>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>LIBELLÉ</th>
          <th style="text-align:right;">H.T. (€)</th>
          <th style="text-align:right;">TVA (€)</th>
          <th style="text-align:right;">T.T.C (€)</th>
        </tr>
      </thead>
      <tbody>
        ${sections.map(s => buildSection(s.title, s.labels)).join('')}
        ${kmSection}
        ${autresSection}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td style="text-decoration:underline;">TOTAL</td>
          <td style="text-align:right;">${parseFloat(totHt).toFixed(2)} €</td>
          <td style="text-align:right;">${parseFloat(totTva).toFixed(2)} €</td>
          <td style="text-align:right;">${parseFloat(totTtc).toFixed(2)} €</td>
        </tr>
      </tfoot>
    </table>

    <p style="font-size:13px;font-weight:bold;margin-bottom:6px;">DATE & SIGNATURE :</p>
    <p style="font-size:12px;color:#666;margin-bottom:10px;">Fait le ${today} par ${prenom} ${nom}</p>
    <div class="sig-box">
      <img src="data:image/png;base64,${sigBase64}" style="display:block;height:90px;max-width:280px;" alt="Signature">
    </div>

    <p style="font-size:11px;color:#aaa;text-align:center;margin-top:20px;border-top:1px solid #f0f0f0;padding-top:14px;">
      Document généré automatiquement — ${prenom} ${nom} — ${today} — Home Portage<br>
      Conservez vos justificatifs de frais en cas de contrôle fiscal.
    </p>
  </div>
</body>
</html>`;

  // Email HTML (même contenu)
  const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;background:#f4f4f4;">
<div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:#00B4A0;padding:24px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;">NOTE DE FRAIS</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:12px;">Tous les frais doivent être directement liés à votre activité</p>
  </div>
  <div style="padding:20px;">
    <table style="width:100%;background:#f5f5f5;border-radius:6px;margin-bottom:20px;border-collapse:collapse;">
      <tr><td style="padding:10px 14px;font-size:13px;"><strong>NOM & PRÉNOM :</strong> ${prenom} ${nom}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;border-top:1px solid #eee;"><strong>PÉRIODE :</strong> Du ${debut} au ${fin}</td></tr>
      ${isElec ? `<tr><td style="padding:10px 14px;font-size:13px;border-top:1px solid #eee;color:#0a6b58;"><strong>⚡ Véhicule électrique — majoration +20%</strong></td></tr>` : ''}
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e5e5e5;">
      <thead><tr style="background:#f0f0f0;">
        <th style="padding:9px 10px;text-align:left;font-size:11px;color:#666;">LIBELLÉ</th>
        <th style="padding:9px 10px;text-align:right;font-size:11px;color:#666;">H.T. (€)</th>
        <th style="padding:9px 10px;text-align:right;font-size:11px;color:#666;">TVA (€)</th>
        <th style="padding:9px 10px;text-align:right;font-size:11px;color:#666;">T.T.C (€)</th>
      </tr></thead>
      <tbody>
        ${sections.map(s => buildSection(s.title, s.labels)).join('')}
        ${kmSection}
        ${autresSection}
      </tbody>
      <tfoot><tr style="background:#00B4A0;">
        <td style="padding:11px 10px;color:white;font-weight:bold;font-size:14px;text-decoration:underline;">TOTAL</td>
        <td style="padding:11px 10px;color:white;font-weight:bold;text-align:right;">${parseFloat(totHt).toFixed(2)} €</td>
        <td style="padding:11px 10px;color:white;font-weight:bold;text-align:right;">${parseFloat(totTva).toFixed(2)} €</td>
        <td style="padding:11px 10px;color:white;font-weight:bold;text-align:right;">${parseFloat(totTtc).toFixed(2)} €</td>
      </tr></tfoot>
    </table>
    <p style="font-size:13px;font-weight:bold;margin-bottom:6px;">DATE & SIGNATURE :</p>
    <p style="font-size:12px;color:#666;margin-bottom:10px;">Fait le ${today} par ${prenom} ${nom}</p>
    <div style="border:2px solid #00B4A0;border-radius:6px;padding:6px;display:inline-block;background:#fafafa;">
      <img src="cid:signature" style="display:block;height:90px;max-width:280px;" alt="Signature">
    </div>
    <p style="font-size:12px;color:#666;margin-top:16px;">📎 La note de frais complète est jointe en pièce jointe HTML — ouvrez-la et cliquez <strong>"Imprimer / Enregistrer en PDF"</strong>.</p>
    <p style="font-size:11px;color:#aaa;text-align:center;border-top:1px solid #f0f0f0;padding-top:14px;margin-top:16px;">
      Document généré automatiquement — ${prenom} ${nom} — ${today} — Home Portage
    </p>
  </div>
</div>
</body>
</html>`;

  try {
    const filename = `NDF_${nom}_${prenom}_${debut}_${fin}.html`;
    const attachments = [];

    if (sigBase64) {
      attachments.push({ filename: 'signature.png', content: sigBase64, content_id: 'signature', inline: true });
    }

    attachments.push({
      filename,
      content: Buffer.from(pdfHtml).toString('base64'),
    });

    await resend.emails.send({
      from: 'Notes de Frais <frais@homeportage.fr>',
      to: ['contact@homeportage.fr'],
      subject: `Note de frais — ${prenom} ${nom} — du ${debut} au ${fin}`,
      html: emailHtml,
      attachments,
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('Resend error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
