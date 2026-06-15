const { Resend } = require('resend');
const PDFDocument = require('pdfkit');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const {
    nom, prenom, debut, fin, isElec,
    rows, kmNb, kmRate, kmResult,
    totHt, totTva, totTtc,
    signature // base64 PNG
  } = data;

  // --- Génération PDF ---
  const pdfBuffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const margin = 40;

    // En-tête
    doc.rect(0, 0, W, 70).fill('#00B4A0');
    doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
       .text('NOTE DE FRAIS', margin, 20, { align: 'center' });
    doc.fontSize(9).font('Helvetica')
       .text('Tous les frais doivent être directement liés à votre activité', margin, 46, { align: 'center' });

    doc.fillColor('#333');
    let y = 85;

    // Identité
    doc.rect(margin, y, W - margin * 2, 40).fill('#f5f5f5');
    doc.fillColor('#333').fontSize(9).font('Helvetica-Bold')
       .text('NOM & PRÉNOM :', margin + 8, y + 8)
       .font('Helvetica').text(prenom + ' ' + nom, margin + 110, y + 8);
    doc.font('Helvetica-Bold').text('PÉRIODE :', margin + 8, y + 24)
       .font('Helvetica').text('Du ' + debut + ' au ' + fin, margin + 110, y + 24);
    if (isElec) {
      doc.fillColor('#0a6b58').font('Helvetica-Bold').fontSize(8)
         .text('⚡ Véhicule électrique — majoration barème +20% appliquée', margin + 8, y + 38);
    }
    y += isElec ? 58 : 50;

    // Fonction tableau
    function drawSectionHeader(title) {
      doc.rect(margin, y, W - margin * 2, 16).fill('#e0e0e0');
      doc.fillColor('#444').fontSize(8).font('Helvetica-Bold')
         .text(title.toUpperCase(), margin + 6, y + 4);
      doc.text('H.T. (€)', W - 180, y + 4, { width: 45, align: 'right' });
      doc.text('TVA (€)', W - 130, y + 4, { width: 40, align: 'right' });
      doc.text('T.T.C (€)', W - 85, y + 4, { width: 45, align: 'right' });
      y += 17;
    }

    function drawRow(label, ht, tva, ttc, shade) {
      if (shade) doc.rect(margin, y, W - margin * 2, 14).fill('#fafafa');
      doc.fillColor('#333').fontSize(8).font('Helvetica')
         .text(label, margin + 6, y + 3, { width: W - margin * 2 - 145 });
      if (parseFloat(ht) > 0) {
        doc.text(parseFloat(ht).toFixed(2), W - 180, y + 3, { width: 45, align: 'right' });
        doc.text(parseFloat(tva).toFixed(2), W - 130, y + 3, { width: 40, align: 'right' });
        doc.text(parseFloat(ttc).toFixed(2), W - 85, y + 3, { width: 45, align: 'right' });
      }
      doc.moveTo(margin, y + 14).lineTo(W - margin, y + 14).strokeColor('#e5e5e5').stroke();
      y += 15;
    }

    // Sections
    const sections = [
      { title: 'Frais de fonctionnement', keys: ['Publicité','Téléphone','Fournitures administratives','Frais annuels / uniques (RCP, TPE...)','Location local','Confort véhicule'] },
      { title: 'Frais du porté',          keys: ['Repas','Pressing','Vêtements (1 tenue/an)','Coiffeur'] },
      { title: 'Frais de déplacement',    keys: ['Avion / Train / Hôtel','Parking / Autoroute / Lavage','Frais réels véhicule'] },
    ];

    sections.forEach(section => {
      if (y > 680) { doc.addPage(); y = 40; }
      drawSectionHeader(section.title);
      section.keys.forEach((key, i) => {
        const row = rows.find(r => r.label === key) || { ht: 0, tva: 0, ttc: 0 };
        drawRow(key, row.ht, row.tva, row.ttc, i % 2 === 0);
      });
      y += 4;
    });

    // KM
    if (y > 680) { doc.addPage(); y = 40; }
    drawSectionHeader('Indemnités kilométriques');
    const kmLabel = kmNb > 0
      ? `${kmNb} km × ${kmRate} €/km${isElec ? ' (électrique +20%)' : ''}`
      : '—';
    drawRow(kmLabel, kmNb > 0 ? kmResult : 0, 0, kmNb > 0 ? kmResult : 0, false);
    y += 4;

    // Autres
    const autresRow = rows.find(r => r.label === 'autres');
    if (autresRow && parseFloat(autresRow.ht) > 0) {
      drawSectionHeader('Autres');
      drawRow(autresRow.labelText || 'Autre', autresRow.ht, autresRow.tva, autresRow.ttc, false);
      y += 4;
    }

    // Total
    if (y > 680) { doc.addPage(); y = 40; }
    y += 4;
    doc.rect(margin, y, W - margin * 2, 18).fill('#00B4A0');
    doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
       .text('TOTAL', margin + 6, y + 4);
    doc.text(parseFloat(totHt).toFixed(2) + ' €',  W - 180, y + 4, { width: 45, align: 'right' });
    doc.text(parseFloat(totTva).toFixed(2) + ' €', W - 130, y + 4, { width: 40, align: 'right' });
    doc.text(parseFloat(totTtc).toFixed(2) + ' €', W - 85,  y + 4, { width: 45, align: 'right' });
    y += 28;

    // Signature
    if (y > 650) { doc.addPage(); y = 40; }
    const today = new Date().toLocaleDateString('fr-FR');
    doc.fillColor('#333').fontSize(9).font('Helvetica-Bold')
       .text('DATE & SIGNATURE (obligatoire) :', margin, y);
    doc.font('Helvetica').fontSize(8).fillColor('#666')
       .text('Fait le : ' + today, margin, y + 14);

    // Cadre signature
    doc.rect(margin + 120, y, 200, 55).strokeColor('#00B4A0').lineWidth(1).stroke();
    if (signature) {
      try {
        const sigBuffer = Buffer.from(signature.replace(/^data:image\/png;base64,/, ''), 'base64');
        doc.image(sigBuffer, margin + 122, y + 2, { width: 196, height: 51 });
      } catch(e) {}
    }
    y += 70;

    // Pied de page
    doc.fontSize(7).fillColor('#aaa').font('Helvetica-Oblique')
       .text(
         `Document généré automatiquement — ${prenom} ${nom} — ${today} — Home Portage`,
         margin, y, { align: 'center' }
       );

    doc.end();
  });

  // --- Envoi email via Resend ---
  const today = new Date().toLocaleDateString('fr-FR');
  const filename = `NDF_${nom}_${prenom}_${debut}_${fin}.pdf`;

  try {
    await resend.emails.send({
      from: 'Notes de Frais <frais@homeportage.fr>',
      to: ['contact@homeportage.fr'],
      subject: `Note de frais — ${prenom} ${nom} — du ${debut} au ${fin}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#00B4A0;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
            <h1 style="color:white;margin:0;font-size:20px;">NOTE DE FRAIS</h1>
          </div>
          <div style="padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;">
            <p><strong>Chauffeur :</strong> ${prenom} ${nom}</p>
            <p><strong>Période :</strong> Du ${debut} au ${fin}</p>
            ${isElec ? '<p style="color:#0a6b58;">⚡ Véhicule électrique — majoration +20% appliquée</p>' : ''}
            <table style="width:100%;border-collapse:collapse;margin-top:16px;">
              <tr style="background:#f5f5f5;">
                <td style="padding:8px;font-weight:bold;">Total H.T.</td>
                <td style="padding:8px;text-align:right;">${parseFloat(totHt).toFixed(2)} €</td>
              </tr>
              <tr>
                <td style="padding:8px;font-weight:bold;">Total TVA</td>
                <td style="padding:8px;text-align:right;">${parseFloat(totTva).toFixed(2)} €</td>
              </tr>
              <tr style="background:#00B4A0;color:white;">
                <td style="padding:8px;font-weight:bold;">Total T.T.C</td>
                <td style="padding:8px;text-align:right;font-weight:bold;">${parseFloat(totTtc).toFixed(2)} €</td>
              </tr>
            </table>
            <p style="margin-top:16px;font-size:12px;color:#888;">Le PDF signé est joint à cet email. Généré le ${today}.</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer.toString('base64'),
        }
      ]
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
