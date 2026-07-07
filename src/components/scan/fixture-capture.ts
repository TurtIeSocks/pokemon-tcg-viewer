// fixture-capture.ts
/**
 * R10: dev-gated fixture capture. Same gate as the preview-login panel
 * (`VITE_CLAUDE_PREVIEW` or a plain dev build) — never present in a
 * production bundle. Dumps the full camera frame plus the two OCR crops
 * (number strip, name strip) as downloadable PNGs so the owner can build a
 * real-card OCR regression corpus (holos, sleeved, vintage, JP, promo, dim
 * light) instead of relying on clean TCGdex scans as accuracy evidence.
 */
export const FIXTURE_CAPTURE_ENABLED =
	import.meta.env.VITE_CLAUDE_PREVIEW === "true" || import.meta.env.DEV;

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
	canvas.toBlob((blob) => {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}, "image/png");
}

/** Dump the full frame + both crops as `fixture-<ts>-{full,number,name}.png`. */
export function captureFixture(frames: {
	full: HTMLCanvasElement;
	number: HTMLCanvasElement;
	name: HTMLCanvasElement;
}): void {
	const ts = Date.now();
	downloadCanvas(frames.full, `fixture-${ts}-full.png`);
	downloadCanvas(frames.number, `fixture-${ts}-number.png`);
	downloadCanvas(frames.name, `fixture-${ts}-name.png`);
}
