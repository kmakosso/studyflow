/**
 * Open a print-ready window with the given flashcards.
 * The user can use their browser's "Save as PDF" print option.
 */
export function printFlashcards(cards, title = 'Fiches de révision') {
  const rows = cards.map((c, i) => `
    <div class="card">
      <div class="num">Fiche ${i + 1}</div>
      <div class="front">❓ ${escHtml(c.front)}</div>
      <div class="back">✅ ${escHtml(c.back)}</div>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 32px; color: #1a1a2e; background: #fff; font-size: 14px;
    }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 6px; color: #7c6af7; }
    .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
    .card {
      border: 1px solid #e0e0ee; border-radius: 10px;
      padding: 16px 20px; margin-bottom: 14px;
      page-break-inside: avoid; break-inside: avoid;
    }
    .num { font-size: 10px; color: #aaa; font-weight: 700; letter-spacing: .05em;
           text-transform: uppercase; margin-bottom: 8px; }
    .front { font-weight: 700; font-size: 14px; margin-bottom: 10px; line-height: 1.5; }
    .back {
      font-size: 13px; color: #444; border-top: 1px solid #eee;
      padding-top: 10px; line-height: 1.6; white-space: pre-wrap;
    }
    @media print {
      body { padding: 16px; }
      .card { border-color: #ccc; }
    }
  </style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p class="meta">${cards.length} fiche${cards.length > 1 ? 's' : ''} · Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
  ${rows}
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) { alert('Autorisez les popups pour exporter en PDF.'); return; }
  w.document.write(html);
  w.document.close();
}

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
