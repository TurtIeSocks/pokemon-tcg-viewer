/**
 * R1: guide-frame alignment geometry. Pure math, no DOM. The scan UI draws
 * a fixed card-shaped outline; the user aligns the physical card to it.
 * Crop regions below are fixed rectangles relative to that guide, not
 * derived from edge detection (out of v1 scope, see spec).
 */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Standard trading-card aspect ratio, width:height (63mm x 88mm). */
const CARD_ASPECT_W = 63;
const CARD_ASPECT_H = 88;
const CARD_ASPECT = CARD_ASPECT_W / CARD_ASPECT_H;

/** Guide occupies this fraction of the limiting viewport dimension. */
const GUIDE_SCALE = 0.8;

/**
 * Centered card outline sized to 80% of the limiting viewport dimension,
 * preserving the 63:88 card aspect ratio. "Limiting dimension" means: pick
 * the largest guide that (a) fits within the viewport and (b) keeps the
 * aspect ratio, then scale it to 80%.
 */
export function guideRect(viewW: number, viewH: number): Rect {
	// Candidate sized by full viewport height, and by full viewport width.
	const byHeight = { w: viewH * CARD_ASPECT, h: viewH };
	const byWidth = { w: viewW, h: viewW / CARD_ASPECT };

	// The limiting dimension is whichever candidate actually fits inside
	// the viewport on both axes.
	const fitsHeight = byHeight.w <= viewW;
	const base = fitsHeight ? byHeight : byWidth;

	const w = base.w * GUIDE_SCALE;
	const h = base.h * GUIDE_SCALE;

	return {
		x: (viewW - w) / 2,
		y: (viewH - h) / 2,
		w,
		h,
	};
}

/** Top 12% band, inset 8% horizontally on each side. Card name strip. */
export function nameRegion(guide: Rect): Rect {
	const inset = guide.w * 0.08;
	return {
		x: guide.x + inset,
		y: guide.y,
		w: guide.w - inset * 2,
		h: guide.h * 0.12,
	};
}

/**
 * Bottom-left number strip: x=+2%w, y=+90%h, w=45%w, h=8%h. Covers the
 * bottom-left corner only; most cards print `number/total` there.
 */
export function numberRegion(guide: Rect): Rect {
	return {
		x: guide.x + guide.w * 0.02,
		y: guide.y + guide.h * 0.9,
		w: guide.w * 0.45,
		h: guide.h * 0.08,
	};
}

/**
 * Fallback: full-width bottom band for cards whose number sits elsewhere
 * along the bottom edge (e.g. bottom-right, centered). y+88%h, full guide
 * width, 10%h.
 */
export function numberRegionWide(guide: Rect): Rect {
	return {
		x: guide.x,
		y: guide.y + guide.h * 0.88,
		w: guide.w,
		h: guide.h * 0.1,
	};
}

/**
 * Minimum crop height (px) worth handing to OCR: Tesseract wants glyphs at
 * roughly 20px+ and low-res streams (default webcam 640x480) produce number
 * strips far below that. Crops smaller than this get upscaled at draw time.
 */
export const MIN_OCR_CROP_HEIGHT = 96;

/**
 * Output dimensions for an OCR crop of `rect`: identity for large-enough
 * crops, uniformly upscaled so height reaches MIN_OCR_CROP_HEIGHT otherwise.
 */
export function ocrCropDims(rect: Rect): { w: number; h: number } {
	const scale = Math.max(1, MIN_OCR_CROP_HEIGHT / Math.max(1, rect.h));
	return {
		w: Math.max(1, Math.round(rect.w * scale)),
		h: Math.max(1, Math.round(rect.h * scale)),
	};
}

/**
 * R1b: map a rect from intrinsic video-source pixel coordinates to
 * container (rendered element) coordinates under CSS `object-fit: cover`.
 * `cover` uniformly scales the source to fully cover the container (never
 * letterboxes) and crops whichever axis overflows, centered. `scale` is
 * therefore the LARGER of the two per-axis ratios, and the crop offset on
 * the overflowing axis is half of the excess.
 *
 * Points outside the visible slice (i.e. in the cropped-away margin) map to
 * negative or over-container coordinates on purpose — this function does
 * not clamp. Callers that only want the on-screen outline should intersect
 * the result with the container bounds themselves; the detection overlay
 * (scan-view.tsx) doesn't need to, since a detected card box is by
 * construction within the visible video frame.
 */
export function sourceRectToContainer(
	rect: Rect,
	source: { w: number; h: number },
	container: { w: number; h: number },
): Rect {
	const scale = Math.max(container.w / source.w, container.h / source.h);
	const offX = (source.w * scale - container.w) / 2;
	const offY = (source.h * scale - container.h) / 2;
	return {
		x: rect.x * scale - offX,
		y: rect.y * scale - offY,
		w: rect.w * scale,
		h: rect.h * scale,
	};
}

/**
 * R1b: uniformly scale a rect (position AND size) about the origin. Used to
 * map a box detected on a downscaled detection canvas back to full video
 * pixel coordinates -- both canvases share an origin (top-left), so scaling
 * every field by the same factor is the whole transform.
 */
export function scaleRect(rect: Rect, factor: number): Rect {
	return {
		x: rect.x * factor,
		y: rect.y * factor,
		w: rect.w * factor,
		h: rect.h * factor,
	};
}
