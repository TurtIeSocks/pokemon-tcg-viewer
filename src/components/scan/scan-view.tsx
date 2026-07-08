// scan-view.tsx
import { Link } from "@tanstack/react-router";
import {
	CameraIcon,
	FlashlightIcon,
	SparklesIcon,
	SwitchCameraIcon,
	UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { GlassPanel } from "@/components/ui/glass";
import { useBilling } from "@/lib/billing/use-billing";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { useStore } from "../../store";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime-store";
import { normalize } from "../../store/corpus/fuzzy";
import { detectCardRect } from "../../store/scan/detect";
import { matchScan } from "../../store/scan/match";
import { disposeOcr, getOcr } from "../../store/scan/ocr";
import { parseNameText, parseNumberText } from "../../store/scan/parse";
import type { ScanCandidate } from "../../store/scan/scan-types";
import { createVoter } from "../../store/scan/vote";
import { setsForRegion } from "../../store/sets-slice";
import { addStack } from "../../store/userland/userland-store";
import { Button } from "../ui/button";
import { CandidateTray } from "./candidate-tray";
import { captureFixture, FIXTURE_CAPTURE_ENABLED } from "./fixture-capture";
import {
	guideRect,
	nameRegion,
	numberRegion,
	numberRegionWide,
	ocrCropDims,
	type Rect,
	scaleRect,
	sourceRectToContainer,
} from "./guide";
import { useAiScan } from "./use-ai-scan";
import { useCamera } from "./use-camera";

/** JPEG quality for the one-shot AI scan upload (R6). */
const AI_SCAN_JPEG_QUALITY = 0.8;

const LOOP_INTERVAL_MS = 500;
const HINT_DELAY_MS = 6000;

// AI scan (Plus, /api/scan haiku vision) is built and server-gated but held
// back from the UI until on-device accuracy is field-proven -- the vision path
// isn't ready to be seen yet. Flip to true to surface the button + upload
// disclosure again. Handler + crop helpers stay wired (not deleted) so
// re-enabling is this one line, not a rebuild.
const AI_SCAN_ENABLED = false;

/** Draw `source` cropped to `rect` (source coords) onto an offscreen canvas, full color. */
function cropToCanvasColor(
	source: CanvasImageSource,
	rect: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(rect.w));
	canvas.height = Math.max(1, Math.round(rect.h));
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	ctx.drawImage(
		source,
		rect.x,
		rect.y,
		rect.w,
		rect.h,
		0,
		0,
		canvas.width,
		canvas.height,
	);
	return canvas;
}

/** Lazily create-and-cache the offscreen full-frame canvas on `ref` (R1 SSR safety, see ScanView). */
function getFullCanvas(ref: {
	current: HTMLCanvasElement | null;
}): HTMLCanvasElement {
	if (!ref.current) {
		ref.current = document.createElement("canvas");
	}
	return ref.current;
}

/**
 * R1b: detection runs on a small downscaled canvas -- the histogram
 * trimming in detectCardRect is O(pixels), and a full-res frame buys
 * nothing extra for a box this coarse. Height stays proportional to the
 * video's own aspect ratio so the downscale doesn't distort what gets fed
 * to the Otsu threshold.
 */
const DETECT_CANVAS_W = 160;

/** Lazily create-and-cache the offscreen detection canvas on `ref` (mirrors getFullCanvas). */
function getDetectCanvas(ref: {
	current: HTMLCanvasElement | null;
}): HTMLCanvasElement {
	if (!ref.current) {
		ref.current = document.createElement("canvas");
	}
	return ref.current;
}

/**
 * R1b: downscale `video` onto the shared detection canvas and run
 * `detectCardRect`. Returns a Rect already scaled back up to FULL video
 * pixel coordinates, or null when no card-shaped region was found --
 * callers fall back to the fixed guide frame unchanged. Safe to call from
 * both the live loop (runFrame) and the one-shot AI-scan button: each call
 * is a synchronous draw+read with no `await` in between, so two calls can't
 * interleave on the shared canvas even though they share `ref`.
 */
function detectGuideFromVideo(
	video: HTMLVideoElement,
	viewW: number,
	viewH: number,
	ref: { current: HTMLCanvasElement | null },
): Rect | null {
	const canvas = getDetectCanvas(ref);
	const detW = DETECT_CANVAS_W;
	const detH = Math.max(1, Math.round((DETECT_CANVAS_W * viewH) / viewW));
	canvas.width = detW;
	canvas.height = detH;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	ctx.filter = "none";
	ctx.drawImage(video, 0, 0, detW, detH);
	const detected = detectCardRect(ctx.getImageData(0, 0, detW, detH));
	if (!detected) return null;
	return scaleRect(detected, viewW / detW);
}

/** Encode a canvas as JPEG (quality 0.8, R6) and strip the data-URL prefix. */
function canvasToJpegBase64(canvas: HTMLCanvasElement): string | null {
	const dataUrl = canvas.toDataURL("image/jpeg", AI_SCAN_JPEG_QUALITY);
	const comma = dataUrl.indexOf(",");
	return comma === -1 ? null : dataUrl.slice(comma + 1);
}

/**
 * Draw `source` cropped to `rect` (source coords) onto an offscreen canvas,
 * grayscale+contrast, upscaled to the OCR floor when the strip is small
 * (low-res webcam streams starve Tesseract of glyph pixels otherwise).
 */
function cropToCanvas(
	source: CanvasImageSource,
	rect: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const dims = ocrCropDims(rect);
	canvas.width = dims.w;
	canvas.height = dims.h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.filter = "grayscale(1) contrast(1.6)";
	ctx.drawImage(
		source,
		rect.x,
		rect.y,
		rect.w,
		rect.h,
		0,
		0,
		canvas.width,
		canvas.height,
	);
	return canvas;
}

/**
 * Camera view + guide overlay + live OCR loop (R1, R3). Renders behind a
 * lazy import from `scan.tsx` so Tesseract.js never loads outside `/scan`.
 */
export function ScanView() {
	const camera = useCamera();
	const videoWrapRef = useRef<HTMLDivElement | null>(null);
	// Lazy-init (R1 SSR safety): `useRef(document.createElement("canvas"))`
	// would call `document.createElement` during render, which throws under
	// SSR (no `document`). The offscreen canvas is only ever needed inside
	// event-driven capture paths (runFrame/handleFileFallback), so it is
	// created on first use via getFullCanvas() below, never at render time.
	const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
	// R1b: separate small canvas for detection (see DETECT_CANVAS_W) so the
	// full-res canvas above stays dedicated to crops/fixtures.
	const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
	// R1b: last box painted for the live lock-on outline, in CONTAINER
	// (rendered-element) coords -- compared against the next tick's mapped
	// box to skip a setState when nothing moved meaningfully. The tick is
	// already throttled to 500ms so this isn't load-bearing for perf; it's
	// here mainly so a jittery detection near the validity boundary doesn't
	// flicker the outline's transition on every frame.
	const lastBoxRef = useRef<Rect | null>(null);
	const voterRef = useRef(createVoter());
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	// True only while the live loop is supposed to be running. clearInterval
	// stops FUTURE ticks, but an in-flight runFrame continuation would still
	// land setState calls after unmount (or after the tray opened) — each
	// await in runFrame is followed by a check of this ref before touching state.
	const isActiveRef = useRef(false);
	// R4: skip a tick while the previous runFrame is still in flight. Without
	// this, overlapping 500ms ticks can race the single FIFO Tesseract worker
	// -- two concurrent runFrame calls both await getOcr() then interleave
	// setParameters+recognize pairs, so the whitelist can flip (name pass
	// clears it, number pass expects it set) mid-frame. ocr.ts additionally
	// serializes each pair with a module-level mutex as defense in depth;
	// this ref is the cheap first line of defense in the caller.
	const busyRef = useRef(false);
	// R3: name-only path has no voter behind it (the voter only tallies
	// keyed number readings), so a tiny local streak counter stands in for
	// it -- two consecutive ~equal (normalized) name guesses required before
	// the live loop opens the tray. Reset whenever a keyed consensus fires
	// or a frame disagrees. The one-shot file-upload path
	// (handleFileFallback) does NOT use this: a single photo has no "next
	// frame" to build a streak from, so an immediate name-only tray there is
	// the legitimate single-shot behavior R3 already carves out.
	const nameStreakRef = useRef<{ text: string | null; count: number }>({
		text: null,
		count: 0,
	});
	const lastCropsRef = useRef<{
		full: HTMLCanvasElement;
		number: HTMLCanvasElement;
		name: HTMLCanvasElement;
	} | null>(null);

	const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
	const [nameGuess, setNameGuess] = useState<string | null>(null);
	// R1b: live lock-on outline, in CONTAINER coords (see sourceRectToContainer).
	const [detectedBox, setDetectedBox] = useState<Rect | null>(null);
	const [lastRead, setLastRead] = useState<string | null>(null);
	const [sessionCount, setSessionCount] = useState(0);
	const [showHint, setShowHint] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [aiScanning, setAiScanning] = useState(false);

	const index = useCorpusRuntime((s) => s.index);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	const sets = useStore((s) => setsForRegion(s, activeRegion));

	// R6/R7: Plus AI scan. `useBilling()` is render-only UI state (R15
	// fail-open convention) -- used ONLY to decide the chip/button copy here,
	// never as a gate. The real gate lives server-side in /api/scan.
	const aiScan = useAiScan();
	const billing = useBilling();
	const isPlus = billing.entitlement.tier !== "free";

	const clearLoop = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const runFrame = useCallback(async () => {
		// R4: skip this tick entirely if the previous runFrame hasn't finished.
		// Overlapping ticks would both await getOcr() and interleave
		// setParameters+recognize pairs on the single FIFO Tesseract worker,
		// so the whitelist could flip between the number and name pass
		// mid-frame. See busyRef comment above and the mutex in ocr.ts.
		if (busyRef.current) return;
		busyRef.current = true;
		try {
			const video = camera.videoRef.current;
			if (!video || video.readyState < 2 || !index) return;
			const viewW = video.videoWidth;
			const viewH = video.videoHeight;
			if (!viewW || !viewH) return;

			const full = getFullCanvas(fullCanvasRef);
			full.width = viewW;
			full.height = viewH;
			const fullCtx = full.getContext("2d");
			if (!fullCtx) return;
			fullCtx.filter = "none";
			fullCtx.drawImage(video, 0, 0, viewW, viewH);

			// R1b: prefer the detected card box over the fixed guide frame --
			// null (no valid box this tick) falls back to guideRect unchanged.
			const detected = detectGuideFromVideo(
				video,
				viewW,
				viewH,
				detectCanvasRef,
			);
			const guide = detected ?? guideRect(viewW, viewH);

			// Live lock-on outline (container coords). Presynchronous with the
			// detection above -- no `await` has happened yet, so isActiveRef
			// can't have flipped since this tick started.
			if (!detected) {
				if (lastBoxRef.current !== null) {
					lastBoxRef.current = null;
					setDetectedBox(null);
				}
			} else {
				const container = { w: video.clientWidth, h: video.clientHeight };
				if (container.w && container.h) {
					const mapped = sourceRectToContainer(
						detected,
						{ w: viewW, h: viewH },
						container,
					);
					const prev = lastBoxRef.current;
					const moved =
						!prev ||
						Math.abs(prev.x - mapped.x) > 2 ||
						Math.abs(prev.y - mapped.y) > 2 ||
						Math.abs(prev.w - mapped.w) > 2 ||
						Math.abs(prev.h - mapped.h) > 2;
					if (moved) {
						lastBoxRef.current = mapped;
						setDetectedBox(mapped);
					}
				}
			}

			// Wide bottom band as the ONLY number region: numbers sit bottom-left,
			// bottom-right, or centered depending on era, and the parser already
			// digs N/T out of surrounding noise. One pass per tick beats the old
			// narrow-then-wide retry (half the OCR latency when not bottom-left).
			const numberCanvas = cropToCanvas(video, numberRegionWide(guide));
			const nameCanvas = cropToCanvas(video, nameRegion(guide));
			lastCropsRef.current = { full, number: numberCanvas, name: nameCanvas };

			try {
				const ocr = await getOcr();
				if (!isActiveRef.current) return;
				const numberText = await ocr.recognizeNumber(numberCanvas);
				if (!isActiveRef.current) return;
				const reading = parseNumberText(numberText);
				const nameText = parseNameText(await ocr.recognizeName(nameCanvas));
				if (!isActiveRef.current) return;
				setNameGuess(nameText);
				// Live alignment feedback: without this the user wiggles the card
				// blindly until the tray appears. Show what OCR actually read.
				setLastRead(
					reading
						? reading.total != null
							? `${reading.number}/${reading.total}`
							: reading.number
						: nameText
							? `name: ${nameText}`
							: null,
				);

				const consensus = voterRef.current.push(reading);
				// R3: single-frame results are never trusted. A keyed reading
				// already goes through the voter's 2-frame consensus above. The
				// name-only path (no number detected at all, e.g. glare on the
				// bottom strip) has no voter backing it, so it gets its own
				// 2-consecutive-agreeing-guess counter here before opening the
				// tray -- see nameStreakRef below.
				if (consensus) {
					nameStreakRef.current = { text: null, count: 0 };
					const found = matchScan(
						{ reading: consensus, nameText },
						index.cards,
						sets ?? [],
					);
					if (found.length > 0) {
						setCandidates(found);
						setShowHint(false);
					}
				} else if (!reading && nameText) {
					const normalized = normalize(nameText);
					const streak = nameStreakRef.current;
					if (streak.text === normalized) {
						streak.count += 1;
					} else {
						nameStreakRef.current = { text: normalized, count: 1 };
					}
					if (nameStreakRef.current.count >= 2) {
						const found = matchScan(
							{ reading: null, nameText },
							index.cards,
							sets ?? [],
						);
						if (found.length > 0) {
							setCandidates(found);
							setShowHint(false);
						}
					}
				} else {
					nameStreakRef.current = { text: null, count: 0 };
				}
			} catch {
				// A single bad frame is expected (motion blur, misalignment); the
				// voter/loop simply tries again on the next tick.
			}
		} finally {
			busyRef.current = false;
		}
	}, [camera.videoRef, index, sets]);

	// Live loop: only while the camera is active and no candidates are
	// awaiting confirmation (avoid re-scanning under the open tray).
	useEffect(() => {
		if (camera.status !== "active" || candidates.length > 0) {
			clearLoop();
			// R1b: don't leave a stale lock-on outline showing over a stopped
			// camera or behind the open candidate tray.
			lastBoxRef.current = null;
			setDetectedBox(null);
			return;
		}
		setScanning(true);
		isActiveRef.current = true;
		intervalRef.current = setInterval(() => {
			void runFrame();
		}, LOOP_INTERVAL_MS);
		return () => {
			// In-flight runFrame continuations check this ref after each await:
			// once false (unmount, tray opened, camera stopped), they bail
			// before touching state.
			isActiveRef.current = false;
			clearLoop();
		};
	}, [camera.status, candidates.length, runFrame, clearLoop]);

	// R4 teardown: terminate the Tesseract worker when leaving /scan. Without
	// this the ~3MB wasm worker stays resident for the rest of the session.
	// Safe when the worker was never initialized (disposeOcr no-ops).
	useEffect(() => {
		return () => {
			void disposeOcr();
		};
	}, []);

	// Cleared on unmount AND when the document is hidden (R1: don't keep the
	// camera light on in a backgrounded tab); use-camera already stops tracks
	// on visibilitychange, this additionally halts our own OCR polling.
	useEffect(() => {
		function onVisibility() {
			if (document.visibilityState === "hidden") clearLoop();
		}
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, [clearLoop]);

	// Hint chip after ~6s of scanning without consensus.
	useEffect(() => {
		if (!scanning || candidates.length > 0) {
			setShowHint(false);
			return;
		}
		const t = setTimeout(() => setShowHint(true), HINT_DELAY_MS);
		return () => clearTimeout(t);
	}, [scanning, candidates.length]);

	async function handleAdd(cardId: string, quantity: number) {
		try {
			await addStack(cardId, quantity > 1 ? { quantity } : {});
			toast.success(
				quantity > 1 ? `Added ${quantity} to Vault.` : "Added to Vault.",
			);
			setSessionCount((n) => n + quantity);
			setCandidates([]);
			setNameGuess(null);
			voterRef.current.reset();
			nameStreakRef.current = { text: null, count: 0 };
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Couldn't add that card.");
		}
	}

	/**
	 * "Not these, keep scanning" (fix 4): clears the current candidates and
	 * both accumulators so the live loop resumes from a clean slate instead
	 * of instantly re-opening the tray on the very next tick with the same
	 * stale voter/streak state.
	 */
	function handleDismissCandidates() {
		setCandidates([]);
		setNameGuess(null);
		voterRef.current.reset();
		nameStreakRef.current = { text: null, count: 0 };
	}

	/**
	 * R6/R7/R1b: Plus AI scan. Captures the current frame as a color JPEG
	 * (quality 0.8), cropped to the detected card box when one validates on
	 * this frame (falling back to the fixed guide otherwise, same as the
	 * device loop), POSTs it once via `useAiScan`, and folds the result into
	 * the same candidate tray the device loop feeds. Mirrors
	 * `runFrame`'s isActiveRef discipline: every check after an `await`
	 * bails before touching state once the view has gone inactive (unmount,
	 * camera stopped, or the tray already opened for a different scan).
	 *
	 * Branches ONLY on `run`'s returned discriminated result, never on
	 * `aiScan.state` read after the `await` -- `state` is a hook-internal
	 * value that can already reflect a LATER call by the time this
	 * continuation resumes (e.g. a quick retry), which previously both kept
	 * dead 401/403 branches alive here and could silently discard a
	 * successful retry that followed a prior failure.
	 */
	async function handleAiScan() {
		if (aiScanning) return;
		const video = camera.videoRef.current;
		if (!video || video.readyState < 2) {
			toast.error("Start the camera first.");
			return;
		}
		const viewW = video.videoWidth;
		const viewH = video.videoHeight;
		if (!viewW || !viewH) return;

		const detected = detectGuideFromVideo(video, viewW, viewH, detectCanvasRef);
		const guide = detected ?? guideRect(viewW, viewH);
		const frameCanvas = cropToCanvasColor(video, guide);
		const frameBase64 = canvasToJpegBase64(frameCanvas);
		if (!frameBase64) {
			toast.error("Could not capture a frame. Try again.");
			return;
		}

		setAiScanning(true);
		try {
			const result = await aiScan.run(frameBase64);
			if (!isActiveRef.current) return;

			if (result.state === "unauthorized" || result.state === "needs_plus") {
				// Handled inline by the button (routes to /billing); nothing to
				// fall back to here, the device loop keeps running underneath.
				return;
			}
			if (result.state === "error") {
				// R7: errors fall back silently to the device loop, plus a toast.
				toast.error("AI scan failed. Falling back to the live scanner.");
				return;
			}
			// result.state === "ok" (only remaining case, narrowed explicitly
			// since TS doesn't infer it across the two `return`s above).
			if (result.state !== "ok") return;
			if (result.candidates.length > 0) {
				setCandidates(result.candidates);
				setShowHint(false);
			} else {
				toast.error("Couldn't identify that card. Try again or keep scanning.");
			}
		} finally {
			// React 18 no-ops a post-unmount setState, so this can run
			// unconditionally: a guard here (checking isActiveRef) would leave
			// `aiScanning` stuck true if the view deactivates mid-call while the
			// component is still mounted (e.g. camera stopped, tray opened by
			// the device loop) -- see final-review fix 6.
			setAiScanning(false);
		}
	}

	async function handleFileFallback(file: File) {
		try {
			const bitmap = await createImageBitmap(file);
			const video = { videoWidth: bitmap.width, videoHeight: bitmap.height };
			const guide = guideRect(video.videoWidth, video.videoHeight);
			const full = getFullCanvas(fullCanvasRef);
			full.width = bitmap.width;
			full.height = bitmap.height;
			full.getContext("2d")?.drawImage(bitmap, 0, 0);

			let numberCanvas = cropToCanvas(bitmap, numberRegion(guide));
			const nameCanvas = cropToCanvas(bitmap, nameRegion(guide));
			lastCropsRef.current = { full, number: numberCanvas, name: nameCanvas };

			const ocr = await getOcr();
			let reading = parseNumberText(await ocr.recognizeNumber(numberCanvas));
			if (!reading) {
				numberCanvas = cropToCanvas(bitmap, numberRegionWide(guide));
				lastCropsRef.current = { full, number: numberCanvas, name: nameCanvas };
				reading = parseNumberText(await ocr.recognizeNumber(numberCanvas));
			}
			const nameText = parseNameText(await ocr.recognizeName(nameCanvas));
			setNameGuess(nameText);
			if (!index) return;
			const found = matchScan({ reading, nameText }, index.cards, sets ?? []);
			setCandidates(found);
		} catch {
			// Corrupt/undecodable upload or a failed OCR pass; mirror runFrame's
			// swallow-and-continue policy but tell the user, since a one-shot
			// upload has no next tick to retry on.
			toast.error("Could not read that image. Try another photo.");
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="max-w-md rounded-(--r-control) border border-(--primary)/30 bg-(--primary-wash) px-3 py-2 text-xs text-(--ink-muted)">
				<span className="font-medium text-(--ink)">Early alpha.</span> The
				scanner is brand new and still learning, so results will keep improving.
				If a card is not found, line it up inside the frame, add more light, or
				search for it manually.
			</p>

			<GlassPanel className="relative aspect-3/4 w-full max-w-md overflow-hidden">
				<div ref={videoWrapRef} className="absolute inset-0">
					{camera.status === "active" ? (
						<video
							ref={camera.videoRef}
							autoPlay
							muted
							playsInline
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center p-6 text-center text-(--ink-muted)">
							{camera.status === "denied" &&
								"Camera access was denied. Use the upload option below."}
							{camera.status === "unavailable" &&
								"No camera available. Use the upload option below."}
							{camera.status === "idle" &&
								"Start the camera to begin scanning."}
						</div>
					)}
				</div>

				{camera.status === "active" && <GuideOverlay />}
				{camera.status === "active" && detectedBox && (
					<DetectedBoxOutline rect={detectedBox} />
				)}

				{camera.status === "active" && (
					<div className="absolute top-3 left-3 rounded-(--r-pill) border border-white/10 bg-black/50 px-3 py-1 font-mono text-xs text-white tabular-nums">
						{sessionCount} scanned this session
					</div>
				)}

				{camera.status === "active" &&
					(camera.torch.supported || camera.lenses.count > 1) && (
						<div className="absolute top-3 right-3 flex items-center gap-2">
							{camera.torch.supported && (
								<Button
									type="button"
									size="icon-sm"
									variant="secondary"
									aria-label={
										camera.torch.on
											? "Turn off flashlight"
											: "Turn on flashlight"
									}
									onClick={() => void camera.torch.toggle()}
								>
									<FlashlightIcon />
								</Button>
							)}
							{camera.lenses.count > 1 && (
								// Lens pinning: some phones firmware-switch to a macro
								// lens inside a trigger distance that card scanning
								// sits right on, causing focus flapping -- cycling to
								// a pinned deviceId is the fix.
								<Button
									type="button"
									size="icon-sm"
									variant="secondary"
									aria-label="Switch camera lens"
									onClick={() => void camera.lenses.cycle()}
								>
									<SwitchCameraIcon />
								</Button>
							)}
						</div>
					)}

				{camera.status === "active" && lastRead && (
					<div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-(--r-pill) border border-white/10 bg-black/60 px-3 py-1.5 text-center font-mono text-xs text-white tabular-nums">
						Saw: {lastRead}
					</div>
				)}
				{showHint && !lastRead && (
					<div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-(--r-pill) border border-white/10 bg-black/60 px-3 py-1.5 text-center text-xs text-white">
						More light. Fill the frame.
					</div>
				)}
			</GlassPanel>

			<p className="max-w-md text-xs text-(--ink-muted)">
				Scanning happens on your device. Photos never leave it.
			</p>

			<div className="flex flex-wrap items-center gap-2">
				{camera.status !== "active" && (
					<Button type="button" onClick={() => void camera.start()}>
						<CameraIcon /> Start camera
					</Button>
				)}
				{camera.status !== "active" && (
					<FileFallbackButton onFile={handleFileFallback} />
				)}
				{AI_SCAN_ENABLED &&
					camera.status === "active" &&
					(aiScan.state === "needs_plus" || aiScan.state === "unauthorized" ? (
						<Button type="button" variant="outline" size="sm" asChild>
							<Link to="/billing">
								<SparklesIcon /> AI scan
								<Badge variant="default">Plus</Badge>
							</Link>
						</Button>
					) : (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void handleAiScan()}
							disabled={aiScanning}
						>
							<SparklesIcon /> {aiScanning ? "Scanning..." : "AI scan"}
							{!isPlus && <Badge variant="default">Plus</Badge>}
						</Button>
					))}
				{FIXTURE_CAPTURE_ENABLED && lastCropsRef.current && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							if (lastCropsRef.current) captureFixture(lastCropsRef.current);
						}}
					>
						Capture fixture
					</Button>
				)}
			</div>

			{AI_SCAN_ENABLED && camera.status === "active" && (
				<p className="max-w-md text-xs text-(--ink-muted)">
					AI scan sends this one photo to the server.
				</p>
			)}

			{camera.zoom.supported && camera.status === "active" && (
				// The other lens-flapping lever (see the lenses.cycle() button
				// above): zooming in from farther away keeps the card outside the
				// macro-lens trigger distance without switching physical lenses.
				// Two fixed stops only (ponytail) -- no slider.
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant={
								Math.round(camera.zoom.value) === 1 ? "default" : "secondary"
							}
							aria-label="Zoom 1x"
							onClick={() => void camera.zoom.set(1)}
						>
							1x
						</Button>
						<Button
							type="button"
							size="sm"
							variant={
								Math.round(camera.zoom.value) === 2 ? "default" : "secondary"
							}
							aria-label="Zoom 2x"
							onClick={() => void camera.zoom.set(2)}
						>
							2x
						</Button>
					</div>
					<p className="max-w-md text-xs text-(--ink-muted)">
						Tip: zoom in and hold the card farther away for steadier focus.
					</p>
				</div>
			)}

			<CandidateTray
				candidates={candidates}
				onAdd={handleAdd}
				onDismiss={handleDismissCandidates}
			/>

			{showHint && (
				<Link
					to="/search"
					search={{ ...LIST_SEARCH_DEFAULTS, q: nameGuess ?? "" }}
					className="text-sm text-(--primary) underline-offset-4 hover:underline"
				>
					Search for it manually instead
				</Link>
			)}
		</div>
	);
}

/** Fixed card-shaped outline (R1): dimmed surround, bright border on the guide. Aiming hint; stays up even once R1b lock-on takes over. */
function GuideOverlay() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 flex items-center justify-center"
		>
			<div className="aspect-63/88 h-[80%] rounded-2xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
		</div>
	);
}

/**
 * R1b: live lock-on outline for the detected card box, positioned in
 * container (rendered-element) coords via `sourceRectToContainer`. A short
 * transition smooths box-to-box movement between ticks without implying
 * anything is animating continuously (each tick either holds still or
 * jumps to the next detection).
 */
function DetectedBoxOutline({ rect }: { rect: Rect }) {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute rounded-2xl border-2 border-(--primary) transition-all duration-150 motion-reduce:transition-none"
			style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
		/>
	);
}

function FileFallbackButton({ onFile }: { onFile: (file: File) => void }) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	return (
		<>
			<Button
				type="button"
				variant="outline"
				onClick={() => inputRef.current?.click()}
			>
				<UploadIcon /> Upload a photo
			</Button>
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				capture="environment"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) onFile(file);
					e.target.value = "";
				}}
			/>
		</>
	);
}
