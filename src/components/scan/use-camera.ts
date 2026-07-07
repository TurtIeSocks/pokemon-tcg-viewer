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

export interface UseCameraResult {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	status: CameraStatus;
	start(): Promise<void>;
	stop(): void;
	torch: CameraTorch;
}

export function useCamera(): UseCameraResult {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [status, setStatus] = useState<CameraStatus>("idle");
	const [torchSupported, setTorchSupported] = useState(false);
	const [torchOn, setTorchOn] = useState(false);

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
	}, []);

	const stop = useCallback(() => {
		stopTracks();
		if (videoRef.current) {
			videoRef.current.srcObject = null;
		}
		setStatus("idle");
	}, [stopTracks]);

	const start = useCallback(async () => {
		if (
			typeof navigator === "undefined" ||
			!navigator.mediaDevices?.getUserMedia
		) {
			setStatus("unavailable");
			return;
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: "environment" } },
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
	};
}
