/**
 * R4: Tesseract.js OCR worker wrapper. Lazy-loaded on the /scan route only
 * (~3MB wasm + traineddata; cached by the browser after first load). One
 * worker is created and memoized module-level; callers never construct a
 * second worker. Thin by design: raw strings out, no parsing here (see
 * src/store/scan/parse.ts for {number,total} extraction).
 *
 * tesseract.js@7.0.0 installed. API verified against
 * node_modules/tesseract.js/src/index.d.ts + docs/api.md:
 *   - createWorker(langs?, oem?, options?, config?): Promise<Worker>
 *   - worker.setParameters({ tessedit_char_whitelist }): Promise<ConfigResult>
 *   - worker.recognize(image: ImageLike): Promise<RecognizeResult>, where
 *     ImageLike includes HTMLCanvasElement and result.data.text is the
 *     recognized string. This matches the v5+ API (createWorker("eng") then
 *     setParameters); v7 did not change this surface.
 */

export interface OcrEngine {
	recognizeNumber(canvas: HTMLCanvasElement): Promise<string>;
	recognizeName(canvas: HTMLCanvasElement): Promise<string>;
	/** Terminate the underlying Tesseract worker. Callers use {@link disposeOcr}. */
	terminate(): Promise<void>;
}

// Digits + slash for `086/198`-style strips, plus letters to tolerate promo
// ids (e.g. `SWSH123`) that show up in the same bottom-left region.
const NUMBER_WHITELIST = "0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ";

let enginePromise: Promise<OcrEngine> | null = null;

async function createOcrEngine(): Promise<OcrEngine> {
	const { createWorker } = await import("tesseract.js");
	const worker = await createWorker("eng");

	return {
		async recognizeNumber(canvas: HTMLCanvasElement): Promise<string> {
			await worker.setParameters({ tessedit_char_whitelist: NUMBER_WHITELIST });
			const { data } = await worker.recognize(canvas);
			return data.text;
		},
		async recognizeName(canvas: HTMLCanvasElement): Promise<string> {
			// No whitelist for the name pass: card names use full latin text
			// (and accented characters for some regions).
			await worker.setParameters({ tessedit_char_whitelist: "" });
			const { data } = await worker.recognize(canvas);
			return data.text;
		},
		async terminate(): Promise<void> {
			await worker.terminate();
		},
	};
}

/**
 * Terminate the memoized worker (frees the ~3MB wasm runtime) and clear the
 * memo so a later getOcr() boots a fresh one. Safe to call when the engine
 * was never initialized (no-op) or while initialization is still in flight
 * (awaits it, then terminates). Call on /scan unmount.
 */
export async function disposeOcr(): Promise<void> {
	const pending = enginePromise;
	if (!pending) return;
	enginePromise = null;
	try {
		const engine = await pending;
		await engine.terminate();
	} catch {
		// Initialization failed — there is no live worker to tear down.
	}
}

/**
 * Returns the lazily-initialized, memoized OCR engine. Safe to call from
 * SSR modules: the dynamic import + worker creation only happens on first
 * call, and callers on the server should never invoke this (the /scan
 * route is client-only), but guarding on `window` keeps this module
 * importable without side effects during SSR.
 */
export function getOcr(): Promise<OcrEngine> {
	if (typeof window === "undefined") {
		return Promise.reject(new Error("getOcr() is client-only (no window)"));
	}
	if (!enginePromise) {
		enginePromise = createOcrEngine();
	}
	return enginePromise;
}
