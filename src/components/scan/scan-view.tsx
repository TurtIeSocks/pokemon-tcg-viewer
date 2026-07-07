// scan-view.tsx
import { Link } from "@tanstack/react-router";
import { CameraIcon, FlashlightIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/ui/glass";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { useStore } from "../../store";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime-store";
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
import { guideRect, nameRegion, numberRegion, numberRegionWide } from "./guide";
import { useCamera } from "./use-camera";

const LOOP_INTERVAL_MS = 500;
const HINT_DELAY_MS = 6000;

/** Draw `source` cropped to `rect` (source coords) onto an offscreen canvas, grayscale+contrast. */
function cropToCanvas(
	source: CanvasImageSource,
	rect: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(rect.w));
	canvas.height = Math.max(1, Math.round(rect.h));
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
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
	const fullCanvasRef = useRef<HTMLCanvasElement>(
		document.createElement("canvas"),
	);
	const voterRef = useRef(createVoter());
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	// True only while the live loop is supposed to be running. clearInterval
	// stops FUTURE ticks, but an in-flight runFrame continuation would still
	// land setState calls after unmount (or after the tray opened) — each
	// await in runFrame is followed by a check of this ref before touching state.
	const isActiveRef = useRef(false);
	const lastCropsRef = useRef<{
		full: HTMLCanvasElement;
		number: HTMLCanvasElement;
		name: HTMLCanvasElement;
	} | null>(null);

	const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
	const [nameGuess, setNameGuess] = useState<string | null>(null);
	const [sessionCount, setSessionCount] = useState(0);
	const [showHint, setShowHint] = useState(false);
	const [scanning, setScanning] = useState(false);

	const index = useCorpusRuntime((s) => s.index);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	const sets = useStore((s) => setsForRegion(s, activeRegion));

	const clearLoop = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const runFrame = useCallback(async () => {
		const video = camera.videoRef.current;
		if (!video || video.readyState < 2 || !index) return;
		const viewW = video.videoWidth;
		const viewH = video.videoHeight;
		if (!viewW || !viewH) return;

		const full = fullCanvasRef.current;
		full.width = viewW;
		full.height = viewH;
		const fullCtx = full.getContext("2d");
		if (!fullCtx) return;
		fullCtx.filter = "none";
		fullCtx.drawImage(video, 0, 0, viewW, viewH);

		const guide = guideRect(viewW, viewH);
		let numberCanvas = cropToCanvas(video, numberRegion(guide));
		const nameCanvas = cropToCanvas(video, nameRegion(guide));
		lastCropsRef.current = { full, number: numberCanvas, name: nameCanvas };

		try {
			const ocr = await getOcr();
			if (!isActiveRef.current) return;
			let numberText = await ocr.recognizeNumber(numberCanvas);
			if (!isActiveRef.current) return;
			let reading = parseNumberText(numberText);
			if (!reading) {
				// Retry with the wide fallback region (number printed off the
				// bottom-left corner) before giving up this frame.
				numberCanvas = cropToCanvas(video, numberRegionWide(guide));
				lastCropsRef.current = {
					full,
					number: numberCanvas,
					name: nameCanvas,
				};
				numberText = await ocr.recognizeNumber(numberCanvas);
				if (!isActiveRef.current) return;
				reading = parseNumberText(numberText);
			}
			const nameText = parseNameText(await ocr.recognizeName(nameCanvas));
			if (!isActiveRef.current) return;
			setNameGuess(nameText);

			const consensus = voterRef.current.push(reading);
			if (consensus || (!reading && nameText)) {
				const found = matchScan(
					{ reading: consensus, nameText },
					index.cards,
					sets ?? [],
				);
				if (found.length > 0) {
					setCandidates(found);
					setShowHint(false);
				}
			}
		} catch {
			// A single bad frame is expected (motion blur, misalignment); the
			// voter/loop simply tries again on the next tick.
		}
	}, [camera.videoRef, index, sets]);

	// Live loop: only while the camera is active and no candidates are
	// awaiting confirmation (avoid re-scanning under the open tray).
	useEffect(() => {
		if (camera.status !== "active" || candidates.length > 0) {
			clearLoop();
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
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Couldn't add that card.");
		}
	}

	async function handleFileFallback(file: File) {
		try {
			const bitmap = await createImageBitmap(file);
			const video = { videoWidth: bitmap.width, videoHeight: bitmap.height };
			const guide = guideRect(video.videoWidth, video.videoHeight);
			const full = fullCanvasRef.current;
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
			<GlassPanel className="relative aspect-[3/4] w-full max-w-md overflow-hidden">
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
						<div className="flex h-full w-full items-center justify-center p-6 text-center text-[var(--ink-muted)]">
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

				{camera.status === "active" && (
					<div className="absolute top-3 left-3 rounded-[var(--r-pill)] border border-white/10 bg-black/50 px-3 py-1 font-mono text-xs text-white tabular-nums">
						{sessionCount} scanned this session
					</div>
				)}

				{camera.torch.supported && camera.status === "active" && (
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						className="absolute top-3 right-3"
						aria-label={
							camera.torch.on ? "Turn off flashlight" : "Turn on flashlight"
						}
						onClick={() => void camera.torch.toggle()}
					>
						<FlashlightIcon />
					</Button>
				)}

				{showHint && (
					<div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-[var(--r-pill)] border border-white/10 bg-black/60 px-3 py-1.5 text-center text-xs text-white">
						More light. Fill the frame.
					</div>
				)}
			</GlassPanel>

			<p className="max-w-md text-xs text-[var(--ink-muted)]">
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

			<CandidateTray candidates={candidates} onAdd={handleAdd} />

			{showHint && (
				<Link
					to="/search"
					search={{ ...LIST_SEARCH_DEFAULTS, q: nameGuess ?? "" }}
					className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
				>
					Search for it manually instead
				</Link>
			)}
		</div>
	);
}

/** Fixed card-shaped outline (R1): dimmed surround, bright border on the guide. */
function GuideOverlay() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 flex items-center justify-center"
		>
			<div className="aspect-[63/88] h-[80%] rounded-2xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
		</div>
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
