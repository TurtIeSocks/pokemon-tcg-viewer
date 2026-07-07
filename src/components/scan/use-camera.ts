import { useCallback, useEffect, useRef, useState } from "react";

/**
 * R1: guide-frame camera lifecycle. No CV/edge-detection here, just
 * getUserMedia plumbing: rear-camera preference, torch toggle where the
 * track supports it, and teardown on unmount + tab-hide (so the camera
 * light doesn't stay on in a backgrounded tab).
 */
export type CameraStatus = "idle" | "active" | "denied" | "unavailable";

export interface CameraTorch {
	supported: boolean;
	on: boolean;
	toggle(): Promise<void>;
}

/**
 * Lens pinning: phones with logical multi-cameras firmware-switch to a
 * macro lens inside a trigger distance, and card scanning sits exactly on
 * that threshold, causing focus flapping. Cycling to a pinned physical
 * `deviceId` is one of the two browser-side levers for this (the other is
 * `CameraZoom` below).
 */
export interface CameraLenses {
	count: number;
	label: string | null;
	cycle(): Promise<void>;
}

/**
 * Zoom: the other lever for the same macro-lens problem -- zooming in from
 * farther away keeps the card outside the trigger distance without needing
 * a second physical lens at all.
 */
export interface CameraZoom {
	supported: boolean;
	value: number;
	set(v: number): Promise<void>;
}

export interface UseCameraResult {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	status: CameraStatus;
	start(): Promise<void>;
	stop(): void;
	torch: CameraTorch;
	lenses: CameraLenses;
	zoom: CameraZoom;
}

export function useCamera(): UseCameraResult {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [status, setStatus] = useState<CameraStatus>("idle");
	const [torchSupported, setTorchSupported] = useState(false);
	const [torchOn, setTorchOn] = useState(false);
	// Lens list + which physical device is live. Populated after start()
	// (device labels are blank pre-permission, so enumeration only pays off
	// once a stream is granted). `currentDeviceId` is null when the browser
	// picked the device itself (facingMode-only start) -- cycle() treats an
	// unmatched id as "currently on the first lens in the list".
	const [lensDevices, setLensDevices] = useState<MediaDeviceInfo[]>([]);
	const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
	// zoom {min,max,step} isn't state -- it doesn't drive a render on its
	// own, only zoomValue/zoomSupported (derived from it) do.
	const zoomRangeRef = useRef<{
		min: number;
		max: number;
		step: number;
	} | null>(null);
	const [zoomSupported, setZoomSupported] = useState(false);
	const [zoomValue, setZoomValue] = useState(1);

	// The consumer renders <video> only while status === "active", so at the
	// moment getUserMedia resolves the ref is still null and start()'s inline
	// attach silently skips. Re-attach after the commit that mounts the video,
	// or the user gets a black frame with the camera light on.
	useEffect(() => {
		if (status !== "active") return;
		const video = videoRef.current;
		const stream = streamRef.current;
		if (video && stream && video.srcObject !== stream) {
			video.srcObject = stream;
			// autoplay covers most mounts; nudge play() for browsers that don't
			// re-evaluate autoplay when srcObject arrives after mount. play()
			// can throw synchronously (and does in happy-dom) — swallow both.
			try {
				void video.play?.()?.catch?.(() => {});
			} catch {
				// non-playing environment; the attach above is what matters
			}
		}
	}, [status]);

	const stopTracks = useCallback(() => {
		const stream = streamRef.current;
		if (!stream) return;
		for (const track of stream.getTracks()) {
			track.stop();
		}
		streamRef.current = null;
		setTorchSupported(false);
		setTorchOn(false);
		setZoomSupported(false);
	}, []);

	const stop = useCallback(() => {
		stopTracks();
		if (videoRef.current) {
			videoRef.current.srcObject = null;
		}
		setStatus("idle");
	}, [stopTracks]);

	// `deviceId` pins a physical lens (used by lenses.cycle() below); omitted
	// on the normal call path, where `facingMode: environment` lets the OS
	// pick. The two constraints are mutually exclusive in the spec
	// (facingMode describes a LOGICAL camera, deviceId a PHYSICAL one) --
	// most browsers reject the combination, hence the if/else below rather
	// than sending both.
	const start = useCallback(async (deviceId?: string) => {
		if (
			typeof navigator === "undefined" ||
			!navigator.mediaDevices?.getUserMedia
		) {
			setStatus("unavailable");
			return;
		}
		try {
			const videoConstraints: MediaTrackConstraints = {
				// Default streams are often 640x480, which starves the OCR
				// crops of pixels (a number strip lands ~100x25). Ask for
				// 1080p+; devices downgrade gracefully to their best mode.
				width: { ideal: 1920 },
				height: { ideal: 1080 },
			};
			if (deviceId) {
				videoConstraints.deviceId = { exact: deviceId };
			} else {
				videoConstraints.facingMode = { ideal: "environment" };
			}
			const stream = await navigator.mediaDevices.getUserMedia({
				video: videoConstraints,
				audio: false,
			});
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
			}
			const [track] = stream.getVideoTracks();
			const capabilities = track?.getCapabilities?.();
			// `torch` isn't in the lib.dom.d.ts MediaTrackCapabilities type yet
			// on most TS lib versions; capability checks fall back to `in`.
			setTorchSupported(Boolean(capabilities && "torch" in capabilities));
			// Continuous autofocus must be requested where supported (phones,
			// some webcams). Fixed-focus hardware simply lacks the capability;
			// best-effort, same non-standard-typing dance as torch.
			if (track && capabilities && "focusMode" in capabilities) {
				const modes = (capabilities as { focusMode?: string[] }).focusMode;
				if (modes?.includes("continuous")) {
					void track
						.applyConstraints({
							advanced: [
								{ focusMode: "continuous" } as MediaTrackConstraintSet,
							],
						})
						.catch(() => {});
				}
			}
			// Zoom capability -- same non-standard-typing dance as torch above.
			// `zoom` isn't in lib.dom.d.ts's MediaTrackCapabilities either.
			const zoomCap = (
				capabilities as { zoom?: { min: number; max: number; step: number } }
			)?.zoom;
			if (capabilities && "zoom" in capabilities && zoomCap) {
				zoomRangeRef.current = zoomCap;
				setZoomSupported(true);
				const settings = track?.getSettings?.() as
					| { zoom?: number }
					| undefined;
				setZoomValue(settings?.zoom ?? zoomCap.min ?? 1);
			} else {
				zoomRangeRef.current = null;
				setZoomSupported(false);
			}
			// Which physical device is live: an explicit pin always wins;
			// otherwise fall back to whatever the browser reports (may be
			// undefined on a facingMode-only start -- unknown is fine, cycle()
			// below treats an unmatched id as "currently on the first lens").
			const settings = track?.getSettings?.() as
				| { deviceId?: string }
				| undefined;
			setCurrentDeviceId(deviceId ?? settings?.deviceId ?? null);
			// Labels only populate once permission is granted, so this
			// enumeration has to happen AFTER getUserMedia resolves, not on
			// mount -- best-effort, the lens button just stays hidden if it
			// fails or isn't supported by the environment.
			try {
				const devices = await navigator.mediaDevices.enumerateDevices?.();
				if (devices) {
					const videoInputs = devices.filter((d) => d.kind === "videoinput");
					const hasLabels = videoInputs.some((d) => d.label);
					const backish = hasLabels
						? videoInputs.filter((d) => /back|rear|environment/i.test(d.label))
						: videoInputs;
					setLensDevices(backish);
				}
			} catch {
				// enumerateDevices is best-effort; see comment above.
			}
			setStatus("active");
		} catch (err) {
			if (err instanceof DOMException && err.name === "NotAllowedError") {
				setStatus("denied");
			} else {
				setStatus("unavailable");
			}
		}
	}, []);

	const toggleTorch = useCallback(async () => {
		const stream = streamRef.current;
		const [track] = stream ? stream.getVideoTracks() : [];
		if (!track || !torchSupported) return;
		const next = !torchOn;
		try {
			// `torch` is a non-standard MediaTrackConstraintSet extension not
			// yet in lib.dom.d.ts, hence the local widened constraint type.
			await track.applyConstraints({
				advanced: [
					{ torch: next } as MediaTrackConstraintSet & { torch: boolean },
				],
			});
			setTorchOn(next);
		} catch {
			// Some browsers report the capability but reject the constraint
			// (e.g. torch requires the track to be actively rendering). Leave
			// torchOn unchanged; the UI simply doesn't reflect a flip.
		}
	}, [torchOn, torchSupported]);

	const cycleLens = useCallback(async () => {
		if (lensDevices.length < 2) return;
		// Unmatched (null or stale) currentDeviceId defaults to "index 0" --
		// the initial facingMode-only start doesn't always report a deviceId,
		// so the first cycle has to assume something rather than no-op.
		const idx = lensDevices.findIndex((d) => d.deviceId === currentDeviceId);
		const from = idx === -1 ? 0 : idx;
		const next = lensDevices[(from + 1) % lensDevices.length];
		if (!next) return;
		stopTracks();
		await start(next.deviceId);
	}, [lensDevices, currentDeviceId, stopTracks, start]);

	const setZoom = useCallback(async (v: number) => {
		const stream = streamRef.current;
		const [track] = stream ? stream.getVideoTracks() : [];
		const range = zoomRangeRef.current;
		if (!track || !range) return;
		const clamped = Math.min(range.max, Math.max(range.min, v));
		try {
			// `zoom` is a non-standard MediaTrackConstraintSet extension not yet
			// in lib.dom.d.ts, hence the local widened constraint type (mirrors
			// toggleTorch above).
			await track.applyConstraints({
				advanced: [
					{ zoom: clamped } as MediaTrackConstraintSet & { zoom: number },
				],
			});
			setZoomValue(clamped);
		} catch {
			// Some browsers report the capability but reject the constraint;
			// leave zoomValue unchanged, mirrors toggleTorch's failure mode.
		}
	}, []);

	useEffect(() => {
		function onVisibilityChange() {
			// Full stop() (not stopTracks()) on hide: stopTracks() alone left
			// status "active" with a dead srcObject, so coming back to the tab
			// showed a frozen video frame, the live OCR loop (gated on
			// `status === "active"` in scan-view.tsx) never re-armed, and the
			// Start-camera button stayed hidden -- a zombie state with no way
			// back short of reloading the route.
			if (document.visibilityState === "hidden") {
				stop();
			}
		}
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			stopTracks();
		};
	}, [stop, stopTracks]);

	return {
		videoRef,
		status,
		start,
		stop,
		torch: {
			supported: torchSupported,
			on: torchOn,
			toggle: toggleTorch,
		},
		lenses: {
			count: lensDevices.length,
			label:
				lensDevices.find((d) => d.deviceId === currentDeviceId)?.label ?? null,
			cycle: cycleLens,
		},
		zoom: {
			supported: zoomSupported,
			value: zoomValue,
			set: setZoom,
		},
	};
}
