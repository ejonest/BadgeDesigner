/**
 * Uploaded logos are printed as black ink on the sound block, so the art has
 * to be reduced to one colour before it is drawn. Masking on alpha alone turns
 * any file with an opaque background — a JPG, a flattened "transparent" PNG,
 * an SVG with a backing rect — into a solid black rectangle, so the background
 * is separated from the art by brightness instead.
 */

export type BlackInkLogo = {
  canvas: HTMLCanvasElement;
  /** Width ÷ height of the trimmed art, which the caller lays out against. */
  aspect: number;
};

/** Long edge the conversion runs at: enough detail for a 1024px texture. */
const WORK_MAX_PX = 1024;
const WORK_MIN_PX = 256;
/** Alpha below this reads as background when sampling the source. */
const CLEAR_ALPHA = 6;
/** Ink below this is invisible on wood, so it does not hold the margins open. */
const TRIM_ALPHA = 16;
/**
 * Brightness gap between the dark and light class below which the image is
 * treated as having no background to strip (art only, or a single flat tone).
 */
const MIN_CLASS_SEPARATION = 40;
/** Share of the border ring that must carry colour for a backing to exist. */
const BACKED_BORDER_SHARE = 0.25;
/** Share of a backed border that must be dark before the art reads inverted. */
const INVERTED_BORDER_SHARE = 0.7;
/** Tonal ramp for art that is already isolated: white prints nothing... */
const TONE_WHITE = 250;
/** ...and anything this dark prints solid. */
const TONE_SOLID = 90;

const cache = new WeakMap<object, BlackInkLogo | null>();

function sourceSize(
  source: CanvasImageSource,
): { width: number; height: number } | null {
  const img = source as HTMLImageElement;
  const w = img.naturalWidth || (source as HTMLCanvasElement).width || 0;
  const h = img.naturalHeight || (source as HTMLCanvasElement).height || 0;
  if (w > 0 && h > 0) return { width: w, height: h };
  const video = source as HTMLVideoElement;
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return { width: video.videoWidth, height: video.videoHeight };
  }
  return null;
}

/**
 * Otsu's method: the brightness that best splits the histogram into a dark and
 * a light group. Returns the split plus each group's mean and share, which tell
 * us whether the split is real or the image is a single tone.
 */
function otsu(histogram: Uint32Array, total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let darkWeight = 0;
  let darkSum = 0;
  let best = -1;
  let cut = 128;
  for (let i = 0; i < 256; i++) {
    darkWeight += histogram[i];
    if (darkWeight === 0) continue;
    const lightWeight = total - darkWeight;
    if (lightWeight === 0) break;
    darkSum += i * histogram[i];
    const darkMean = darkSum / darkWeight;
    const lightMean = (sum - darkSum) / lightWeight;
    const variance =
      darkWeight * lightWeight * (darkMean - lightMean) * (darkMean - lightMean);
    if (variance > best) {
      best = variance;
      cut = i;
    }
  }
  let darkCount = 0;
  let darkTotal = 0;
  for (let i = 0; i <= cut; i++) {
    darkCount += histogram[i];
    darkTotal += i * histogram[i];
  }
  const lightCount = total - darkCount;
  return {
    cut,
    darkMean: darkCount ? darkTotal / darkCount : 0,
    lightMean: lightCount ? (sum - darkTotal) / lightCount : 255,
    lightShare: total ? lightCount / total : 0,
  };
}

/**
 * Reduces art to black ink on transparency: brightness becomes ink coverage,
 * the background drops out, and empty margins are trimmed so the customer's
 * size slider acts on the art rather than on its padding.
 *
 * Returns null when the art cannot be read (a cross-origin source) or when
 * nothing survives the conversion, so callers can fall back to their own
 * handling rather than printing a blank block.
 */
export function blackInkLogo(
  source: CanvasImageSource | null | undefined,
): BlackInkLogo | null {
  if (!source || typeof document === "undefined") return null;
  const key = source as unknown as object;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const result = convert(source);
  cache.set(key, result);
  return result;
}

function convert(source: CanvasImageSource): BlackInkLogo | null {
  // SVG uploads can report no intrinsic size; rasterize them square and let
  // the trim recover the real proportions.
  const size = sourceSize(source) ?? { width: WORK_MAX_PX, height: WORK_MAX_PX };

  const longEdge = Math.max(size.width, size.height);
  const scale =
    longEdge > WORK_MAX_PX
      ? WORK_MAX_PX / longEdge
      : longEdge < WORK_MIN_PX
        ? WORK_MIN_PX / longEdge
        : 1;
  const w = Math.max(1, Math.round(size.width * scale));
  const h = Math.max(1, Math.round(size.height * scale));

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  let frame: ImageData;
  try {
    frame = ctx.getImageData(0, 0, w, h);
  } catch {
    // Tainted canvas: the pixels are unreadable, so the caller decides.
    return null;
  }
  const px = frame.data;

  // Brightness of every pixel that carries colour, seen against the white the
  // art was authored on. Partly transparent pixels blend toward white so a
  // soft edge does not read as ink.
  const count = w * h;
  const luma = new Uint8Array(count);
  const alpha = new Uint8Array(count);
  const histogram = new Uint32Array(256);
  let sampled = 0;
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    const a = px[p + 3];
    alpha[i] = a;
    const t = a / 255;
    const r = px[p] * t + 255 * (1 - t);
    const g = px[p + 1] * t + 255 * (1 - t);
    const b = px[p + 2] * t + 255 * (1 - t);
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    luma[i] = l;
    if (a > CLEAR_ALPHA) {
      histogram[l]++;
      sampled++;
    }
  }
  if (!sampled) return null;

  const { cut, darkMean, lightMean, lightShare } = otsu(histogram, sampled);
  const separation = lightMean - darkMean;
  const split = separation >= MIN_CLASS_SEPARATION && lightShare > 0.01;

  // Whether the art sits on a filled backing is decided from the border ring:
  // a JPG or a flattened "transparent" PNG has colour all the way to the edge,
  // while art that is genuinely cut out does not. Which side of the split that
  // backing falls on says whether the art is dark-on-light or light-on-dark.
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  let borderSamples = 0;
  let borderDark = 0;
  for (let y = 0; y < h; y++) {
    const edgeRow = y < ring || y >= h - ring;
    for (let x = 0; x < w; x++) {
      if (!edgeRow && x >= ring && x < w - ring) continue;
      const i = y * w + x;
      if (alpha[i] <= CLEAR_ALPHA) continue;
      borderSamples++;
      if (luma[i] <= cut) borderDark++;
    }
  }
  const borderPixels =
    count - Math.max(0, w - 2 * ring) * Math.max(0, h - 2 * ring);
  const backed =
    split && borderSamples > borderPixels * BACKED_BORDER_SHARE;
  const inverted =
    backed &&
    darkMean < 110 &&
    borderDark > borderSamples * INVERTED_BORDER_SHARE;

  // Backed art is split at the threshold so the backing drops out cleanly,
  // with a soft edge so antialiased outlines stay smooth. Art that is already
  // isolated keeps every visible mark and just maps brightness to coverage,
  // so a pale element prints light instead of disappearing.
  const softness = Math.max(8, separation * 0.18);
  const lo = cut - softness / 2;
  const hi = cut + softness / 2;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const coverage = backed
        ? inverted
          ? (luma[i] - lo) / softness
          : (hi - luma[i]) / softness
        : (TONE_WHITE - luma[i]) / (TONE_WHITE - TONE_SOLID);
      const ink =
        Math.min(1, Math.max(0, coverage)) * (alpha[i] / 255);
      const out = i * 4;
      px[out] = 0;
      px[out + 1] = 0;
      px[out + 2] = 0;
      px[out + 3] = Math.round(ink * 255);
      if (px[out + 3] >= TRIM_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  ctx.putImageData(frame, 0, 0);

  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;
  if (trimW === w && trimH === h) {
    return { canvas: work, aspect: w / h };
  }
  const trimmed = document.createElement("canvas");
  trimmed.width = trimW;
  trimmed.height = trimH;
  const trimCtx = trimmed.getContext("2d");
  if (!trimCtx) return { canvas: work, aspect: w / h };
  trimCtx.drawImage(work, minX, minY, trimW, trimH, 0, 0, trimW, trimH);
  return { canvas: trimmed, aspect: trimW / trimH };
}

/** Black-ink art as a PNG data URL, for embedding in the manufacturing SVG. */
export function blackInkLogoDataUrl(
  source: CanvasImageSource | null | undefined,
): { href: string; aspect: number } | null {
  const ink = blackInkLogo(source);
  if (!ink) return null;
  return { href: ink.canvas.toDataURL("image/png"), aspect: ink.aspect };
}
