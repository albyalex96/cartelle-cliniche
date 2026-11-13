/**
 * Pulizia dell'immagine prima dell'OCR: Tesseract è molto sensibile ai puntini dello scanner
 * (polvere, carta ruvida, compressione JPEG), che scambia per lettere o segni.
 *  1. scala di grigi;
 *  2. bianco/nero con soglia automatica (metodo di Otsu);
 *  3. eliminazione delle macchie isolate più piccole di un punto tipografico.
 * Lavora sui pixel RGBA in memoria e li modifica sul posto.
 */
export function cleanForOcr(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, dpi: number) {
  const n = width * height;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const v = (rgba[i]! * 299 + rgba[i + 1]! * 587 + rgba[i + 2]! * 114) / 1000;
    gray[p] = v;
    hist[gray[p]!]!++;
  }
  const threshold = otsu(hist, n);
  const ink = new Uint8Array(n);
  for (let p = 0; p < n; p++) ink[p] = gray[p]! <= threshold ? 1 : 0;

  // Un punto (o una virgola) in corpo 7 a 300 DPI occupa circa 4×4 pixel: sotto, è sporco.
  const minArea = Math.max(3, Math.round(((dpi / 300) * 4) ** 2 * 0.6));
  removeSmallComponents(ink, width, height, minArea);

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const v = ink[p] ? 0 : 255;
    rgba[i] = v;
    rgba[i + 1] = v;
    rgba[i + 2] = v;
    rgba[i + 3] = 255;
  }
  return { threshold, minArea };
}

function otsu(hist: Uint32Array, total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let weightB = 0;
  let best = -1;
  let threshold = 127;
  for (let i = 0; i < 256; i++) {
    weightB += hist[i]!;
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += i * hist[i]!;
    const between = weightB * weightF * (sumB / weightB - (sum - sumB) / weightF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

/** Toglie i gruppi di pixel neri (connessi in 8 direzioni) più piccoli di `minArea`. */
function removeSmallComponents(ink: Uint8Array, width: number, height: number, minArea: number) {
  const seen = new Uint8Array(ink.length);
  const stack = new Int32Array(ink.length);
  const pixels: number[] = [];
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    pixels.length = 0;
    // Basta sapere se la macchia supera la soglia: oltre, non serve ricordarne i pixel.
    let area = 0;
    while (top) {
      const p = stack[--top]!;
      area++;
      if (area <= minArea) pixels.push(p);
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (ink[q] && !seen[q]) {
            seen[q] = 1;
            stack[top++] = q;
          }
        }
      }
    }
    if (area < minArea) for (const p of pixels) ink[p] = 0;
  }
}
