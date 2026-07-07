// Regression: the consumer renders <video> ONLY while status === "active",
// so when getUserMedia resolves the ref is still null and a naive inline
// attach silently skips — the stream must be (re)attached AFTER the video
// mounts, or the user sees a black frame with the camera LED on.
import { afterEach, expect, test } from "bun:test";
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
