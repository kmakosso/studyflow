/* ── ocr/imagePreprocessor.js — Prétraitement d'image (Canvas API) ──
 *
 * 100 % navigateur — pas de Node.js, pas de Sharp.
 * Produit 3 variantes de l'image pour le pipeline multi-pass :
 *   1. original   : redimensionné à ≥ 2400 px de large
 *   2. enhanced   : contraste boosté (pastel → lisible)
 *   3. highContrast : niveaux de gris + seuillage (polices fines)
 */

/** Résolution minimale cible en largeur (px) */
const MIN_WIDTH = 2400;

/* ─── Chargement d'une image depuis un File ──────────────────────── */

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossible de charger l\'image')); };
    img.src = url;
  });
}

/* ─── Redimensionnement vers MIN_WIDTH ──────────────────────────── */

function resizedCanvas(img) {
  const scale = img.naturalWidth < MIN_WIDTH
    ? MIN_WIDTH / img.naturalWidth
    : 1;
  const w = Math.round(img.naturalWidth  * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas;
}

/* ─── Variante "enhanced" : boost contraste (parfait pour pastels) ── */

function applyEnhanced(srcCanvas) {
  const { width: w, height: h } = srcCanvas;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // 1. Trouve le min/max de luminosité (normalisation histogramme)
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < lo) lo = lum;
    if (lum > hi) hi = lum;
  }
  const range = hi - lo || 1;

  // 2. Étire l'histogramme + léger boost de contraste (×1.4)
  const FACTOR = 1.4;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp((((d[i]     - lo) / range) * 255 - 128) * FACTOR + 128);
    d[i + 1] = clamp((((d[i + 1] - lo) / range) * 255 - 128) * FACTOR + 128);
    d[i + 2] = clamp((((d[i + 2] - lo) / range) * 255 - 128) * FACTOR + 128);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/* ─── Variante "highContrast" : niveaux de gris + seuillage ────────── */

function applyHighContrast(srcCanvas, threshold = 140) {
  const { width: w, height: h } = srcCanvas;
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    // Niveaux de gris
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Contraste agressif avant seuillage
    const boosted = clamp((gray - 128) * 2.2 + 128);
    // Seuillage binaire
    const val = boosted >= threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/* ─── Tiling : découpe en 4 quadrants chevauchants ────────────────── */

/**
 * Découpe une image en tuiles pour améliorer l'OCR des grands tableaux.
 * @returns Array de { base64, mimeType, row, col, offsetX, offsetY }
 */
export function tileCanvas(srcCanvas, config = { rows: 2, cols: 2, overlap: 80 }) {
  const { width: W, height: H } = srcCanvas;
  const tileW = Math.ceil(W / config.cols);
  const tileH = Math.ceil(H / config.rows);
  const tiles = [];

  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.cols; col++) {
      const sx = Math.max(0, col * tileW - config.overlap);
      const sy = Math.max(0, row * tileH - config.overlap);
      const sw = Math.min(W, (col + 1) * tileW + config.overlap) - sx;
      const sh = Math.min(H, (row + 1) * tileH + config.overlap) - sy;

      const tileCanvas = document.createElement('canvas');
      tileCanvas.width  = sw;
      tileCanvas.height = sh;
      tileCanvas.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      tiles.push({
        base64:   canvasToBase64(tileCanvas),
        mimeType: 'image/jpeg',
        row, col,
        offsetX: sx, offsetY: sy,
        width: sw, height: sh,
      });
    }
  }
  return tiles;
}

/* ─── Point d'entrée principal ───────────────────────────────────── */

/**
 * Prétraite un File image et retourne les 3 variantes en base64.
 * @returns { original, enhanced, highContrast, tiles, width, height }
 */
export async function preprocessImage(file) {
  const img     = await loadImageFromFile(file);
  const base    = resizedCanvas(img);
  const enhanced     = applyEnhanced(base);
  const highContrast = applyHighContrast(enhanced);  // appliqué SUR enhanced

  return {
    original:     canvasToBase64(base),
    enhanced:     canvasToBase64(enhanced),
    highContrast: canvasToBase64(highContrast),
    tiles:        tileCanvas(enhanced),        // tiles de l'image enhanced
    width:        base.width,
    height:       base.height,
    mimeType:     'image/jpeg',
  };
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function canvasToBase64(canvas) {
  return canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
}

/** Lit un File image et retourne directement le base64 (sans preprocessing) */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
