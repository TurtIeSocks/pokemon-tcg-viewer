// Regression: the consumer renders <video> ONLY while status === "active",
// so when getUserMedia resolves the ref is still null and a naive inline
// attach silently skips — the stream must be (re)attached AFTER the video
// mounts, or the user sees a black frame with the camera LED on.
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useCamera } from "./use-camera";

afterEach(() => {
	cleanup();
	// Restore a pristine navigator between tests (assignment, not delete —
	// the property was installed with defineProperty above).
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: undefined,
	});
});

function fakeStream(): MediaStream {
	// happy-dom's srcObject setter enforces `instanceof MediaStream`, so a
	// plain object double is rejected — but its real class also lacks
	// getTracks/getVideoTracks. Real instance + grafted methods covers both.
	// Empty track list is fine: torch/teardown paths tolerate zero tracks.
	const stream = new MediaStream();
	Object.assign(stream as object, {
		getTracks: () => [],
		getVideoTracks: () => [],
	});
	return stream;
}

/** Mirrors ScanView's conditional render: video exists only once active. */
function Harness() {
	const camera = useCamera();
	return (
		<div>
			{camera.status === "active" ? (
				<video data-testid="video" ref={camera.videoRef} muted playsInline />
			) : (
				<button type="button" onClick={() => void camera.start()}>
					start
				</button>
			)}
		</div>
	);
}

test("stream attaches to a video that mounts only after start() resolves", async () => {
	const stream = fakeStream();
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: async () => stream },
	});

	const { getByText, getByTestId } = render(<Harness />);
	fireEvent.click(getByText("start"));

	await waitFor(() => {
		const video = getByTestId("video") as HTMLVideoElement;
		expect(video.srcObject).toBe(stream);
	});
});

/** Mirrors Harness, but also exposes the lens-cycle control once active. */
function LensHarness() {
	const camera = useCamera();
	return (
		<div>
			{camera.status === "active" ? (
				<>
					<video data-testid="video" ref={camera.videoRef} muted playsInline />
					<button type="button" onClick={() => void camera.lenses.cycle()}>
						cycle
					</button>
				</>
			) : (
				<button type="button" onClick={() => void camera.start()}>
					start
				</button>
			)}
		</div>
	);
}

test("cycle() pins the next back-facing deviceId and omits facingMode", async () => {
	const streams = [fakeStream(), fakeStream()];
	let callCount = 0;
	const calls: MediaStreamConstraints[] = [];
	const devices = [
		{ deviceId: "back-1", kind: "videoinput", label: "Back Camera 0" },
		{ deviceId: "back-2", kind: "videoinput", label: "Back Camera 1" },
		{ deviceId: "front-1", kind: "videoinput", label: "Front Camera" },
	] as MediaDeviceInfo[];
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: {
			getUserMedia: mock(async (constraints: MediaStreamConstraints) => {
				calls.push(constraints);
				const stream = streams[callCount];
				callCount += 1;
				return stream;
			}),
			enumerateDevices: async () => devices,
		},
	});

	const { getByText } = render(<LensHarness />);
	fireEvent.click(getByText("start"));
	await waitFor(() => getByText("cycle"));

	fireEvent.click(getByText("cycle"));
	await waitFor(() => {
		expect(calls.length).toBe(2);
	});

	// Two back-facing labels matched /back|rear|environment/i out of the
	// three enumerated devices; the initial facingMode-only start is
	// treated as "on the first (back-1)" lens, so cycling lands on back-2.
	const secondVideoConstraints = calls[1]?.video as MediaTrackConstraints;
	expect(secondVideoConstraints.deviceId).toEqual({ exact: "back-2" });
	expect(secondVideoConstraints.facingMode).toBeUndefined();
});

/**
 * Fake video track exposing the same non-standard `zoom` capability the
 * hook reads via a narrow cast (see use-camera.ts). `applyConstraints` is a
 * mock so tests can assert the exact constraint shape sent.
 */
function fakeZoomTrack() {
	const applyConstraints = mock(async () => {});
	const track = {
		getCapabilities: () => ({ zoom: { min: 1, max: 8, step: 0.1 } }),
		getSettings: () => ({ zoom: 1 }),
		applyConstraints,
		stop: () => {},
	};
	return { track, applyConstraints };
}

function fakeStreamWithTrack(track: unknown): MediaStream {
	const stream = new MediaStream();
	Object.assign(stream as object, {
		getTracks: () => [track],
		getVideoTracks: () => [track],
	});
	return stream;
}

test("zoom.set() applies the clamped constraint and clamps out-of-range values", async () => {
	const { track, applyConstraints } = fakeZoomTrack();
	const stream = fakeStreamWithTrack(track);
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: async () => stream },
	});

	function ZoomHarness() {
		const camera = useCamera();
		return (
			<div>
				{camera.status === "active" ? (
					<>
						<video
							data-testid="video"
							ref={camera.videoRef}
							muted
							playsInline
						/>
						<button type="button" onClick={() => void camera.zoom.set(2)}>
							zoom2x
						</button>
						<button type="button" onClick={() => void camera.zoom.set(99)}>
							zoomOverMax
						</button>
					</>
				) : (
					<button type="button" onClick={() => void camera.start()}>
						start
					</button>
				)}
			</div>
		);
	}

	const { getByText } = render(<ZoomHarness />);
	fireEvent.click(getByText("start"));
	await waitFor(() => getByText("zoom2x"));

	fireEvent.click(getByText("zoom2x"));
	await waitFor(() => {
		expect(applyConstraints).toHaveBeenCalledWith({
			advanced: [{ zoom: 2 }],
		});
	});

	fireEvent.click(getByText("zoomOverMax"));
	await waitFor(() => {
		expect(applyConstraints).toHaveBeenCalledWith({
			advanced: [{ zoom: 8 }],
		});
	});
});
