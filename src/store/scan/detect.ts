// detect.ts
/**
 * R1b: lightweight on-device card-box detection. Pure, zero DOM deps — takes
 * a raw pixel buffer (structurally `ImageData`-compatible) and returns a
 * bounding box in the SAME pixel coordinates, or null if no card-shaped
 * region is found. Full perspective warp/OpenCV is out of scope (v2
 * ceiling, see spec); this is luminance threshold + row/column histogram
 * trimming, tried against both light-on-dark and dark-on-light polarity.
 *
 * `Rect` is re-used from guide.ts (R1) rather than re-declared here: it's a
 * type-only import (erased at compile time), so it doesn't pull guide.ts's
 * module — or any DOM dependency — into this file's runtime. Kept the
 * import instead of a duplicate local interface so callers pass the same
 * shape into both `detectCardRect` and `guideRect`/`scaleRect` without a cast.
 */
import type { Rect } from "../../components/scan/guide";

/** Structurally `ImageData`-compatible: a real `ImageData` satisfies this as-is. */
export interface Frame {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

/** Trading-card aspect ratio window (w/h), R1b. */
const ASPECT_MIN = 0.55;
const ASPECT_MAX = 0.9;
/** Card must occupy this fraction of the frame's area. */
const AREA_FRACTION_MIN = 0.08;
const AREA_FRACTION_MAX = 0.9;
/** Row/column trim cutoff: below this fraction of that axis's peak, trim. */
const TRIM_FRACTION = 0.25;
/** Minimum in-bbox class-pixel density to call a candidate a solid card. */
const FILL_MIN = 0.65;

/** Per-pixel luminance (BT.601 coefficients), one byte per pixel. */
function computeLuminance(frame: Frame): Uint8ClampedArray {
	const { data, width, height } = frame;
	const lum = new Uint8ClampedArray(width * height);
	for (let i = 0; i < width * height; i++) {
		const o = i * 4;
		lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
	}
	return lum;
}

/** Otsu's method over a 256-bin luminance histogram: the between-class-variance-maximizing split. */
function otsuThreshold(lum: Uint8ClampedArray): number {
	const hist = new Array<number>(256).fill(0);
	for (let i = 0; i < lum.length; i++) hist[lum[i]]++;

	const total = lum.length;
	let sumAll = 0;
	for (let t = 0; t < 256; t++) sumAll += t * hist[t];

	let sumB = 0;
	let weightB = 0;
	let bestVariance = 0;
	let threshold = 0;
	for (let t = 0; t < 256; t++) {
		weightB += hist[t];
		if (weightB === 0) continue;
		const weightF = total - weightB;
		if (weightF === 0) break;
		sumB += t * hist[t];
		const meanB = sumB / weightB;
		const meanF = (sumAll - sumB) / weightF;
		const variance = weightB * weightF * (meanB - meanF) ** 2;
		if (variance > bestVariance) {
			bestVariance = variance;
			threshold = t;
		}
	}
	return threshold;
}

interface ClassCandidate {
	rect: Rect;
	fill: number;
}

/**
 * Row/column histogram trim + fill ratio for ONE polarity class (a pixel
 * predicate over luminance). Returns null when the class has no pixels at
 * all, or when trimming collapses to an empty span (defensive; shouldn't
 * happen once maxRow/maxCol are confirmed nonzero).
 */
function analyzeClass(
	lum: Uint8ClampedArray,
	width: number,
	height: number,
	isClass: (l: number) => boolean,
): ClassCandidate | null {
	const rowCounts = new Array<number>(height).fill(0);
	const colCounts = new Array<number>(width).fill(0);
	for (let y = 0; y < height; y++) {
		const rowOffset = y * width;
		for (let x = 0; x < width; x++) {
			if (isClass(lum[rowOffset + x])) {
				rowCounts[y]++;
				colCounts[x]++;
			}
		}
	}

	const maxRow = Math.max(...rowCounts);
	const maxCol = Math.max(...colCounts);
	if (maxRow === 0 || maxCol === 0) return null;

	const rowCutoff = maxRow * TRIM_FRACTION;
	const colCutoff = maxCol * TRIM_FRACTION;

	let firstRow = 0;
	while (firstRow < height && rowCounts[firstRow] < rowCutoff) firstRow++;
	let lastRow = height - 1;
	while (lastRow >= 0 && rowCounts[lastRow] < rowCutoff) lastRow--;
	let firstCol = 0;
	while (firstCol < width && colCounts[firstCol] < colCutoff) firstCol++;
	let lastCol = width - 1;
	while (lastCol >= 0 && colCounts[lastCol] < colCutoff) lastCol--;

	if (firstRow > lastRow || firstCol > lastCol) return null;

	const bboxW = lastCol - firstCol + 1;
	const bboxH = lastRow - firstRow + 1;

	let classPixelsInBbox = 0;
	for (let y = firstRow; y <= lastRow; y++) {
		const rowOffset = y * width;
		for (let x = firstCol; x <= lastCol; x++) {
			if (isClass(lum[rowOffset + x])) classPixelsInBbox++;
		}
	}

	return {
		rect: { x: firstCol, y: firstRow, w: bboxW, h: bboxH },
		fill: classPixelsInBbox / (bboxW * bboxH),
	};
}

/** aspect + area-fraction + fill validation (R1b thresholds above). */
function isValidCandidate(
	candidate: ClassCandidate,
	frameArea: number,
): boolean {
	const { rect, fill } = candidate;
	const aspect = rect.w / rect.h;
	const areaFraction = (rect.w * rect.h) / frameArea;
	return (
		aspect >= ASPECT_MIN &&
		aspect <= ASPECT_MAX &&
		areaFraction >= AREA_FRACTION_MIN &&
		areaFraction <= AREA_FRACTION_MAX &&
		fill >= FILL_MIN
	);
}

/**
 * R1b: detect a card-shaped bounding box in `frame`. Tries both polarity
 * classes (bright-on-dark, dark-on-bright) around the Otsu split and
 * returns whichever validated candidate has the higher fill ratio; null
 * when neither polarity produces a valid card-shaped region.
 */
export function detectCardRect(frame: Frame): Rect | null {
	const { width, height } = frame;
	if (width <= 0 || height <= 0) return null;

	const lum = computeLuminance(frame);
	const threshold = otsuThreshold(lum);
	const frameArea = width * height;

	const candidates: ClassCandidate[] = [];
	const above = analyzeClass(lum, width, height, (l) => l > threshold);
	if (above && isValidCandidate(above, frameArea)) candidates.push(above);
	const belowEq = analyzeClass(lum, width, height, (l) => l <= threshold);
	if (belowEq && isValidCandidate(belowEq, frameArea)) candidates.push(belowEq);

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.fill - a.fill);
	return candidates[0].rect;
}
