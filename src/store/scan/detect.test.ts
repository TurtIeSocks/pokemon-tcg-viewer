import { describe, expect, test } from "bun:test";
import type { Rect } from "../../components/scan/guide";
import { detectCardRect, type Frame } from "./detect";

// R1b: synthetic-frame tests for the pure detection algorithm. No
// Math.random anywhere — noise is sprinkled at a fixed stride so failures
// reproduce byte-for-byte.

function makeFrame(w: number, h: number, fill: number): Frame {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		const o = i * 4;
		data[o] = fill;
		data[o + 1] = fill;
		data[o + 2] = fill;
		data[o + 3] = 255;
	}
	return { data, width: w, height: h };
}

function drawRect(frame: Frame, rect: Rect, value: number): void {
	const x0 = Math.max(0, Math.round(rect.x));
	const y0 = Math.max(0, Math.round(rect.y));
	const x1 = Math.min(frame.width, Math.round(rect.x + rect.w));
	const y1 = Math.min(frame.height, Math.round(rect.y + rect.h));
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const o = (y * frame.width + x) * 4;
			frame.data[o] = value;
			frame.data[o + 1] = value;
			frame.data[o + 2] = value;
		}
	}
}

/**
 * Deterministic "salt" noise: complement every `stride`-th pixel (flat
 * index) in place. No RNG. `stride` must be coprime with the frame width —
 * a stride that evenly divides the width re-hits the exact same columns on
 * every row, producing full-height vertical stripes instead of scattered
 * speckle (defeats the row-trim defense the algorithm relies on, which is
 * a test-fixture artifact rather than anything real sensor noise does).
 */
function sprinkleNoise(frame: Frame, stride: number): void {
	const total = frame.width * frame.height;
	for (let i = 0; i < total; i += stride) {
		const o = i * 4;
		frame.data[o] = 255 - frame.data[o];
		frame.data[o + 1] = 255 - frame.data[o + 1];
		frame.data[o + 2] = 255 - frame.data[o + 2];
	}
}

// 70x98 -> aspect 0.714..., squarely inside [0.55, 0.9]; area fraction vs a
// 160x120 frame = 6860/19200 = 0.357, inside [0.08, 0.9].
const CARD: Rect = { x: 45, y: 11, w: 70, h: 98 };
const FRAME_W = 160;
const FRAME_H = 120;

describe("detectCardRect", () => {
	test("detects a bright card on a dark background within +-2px", () => {
		const frame = makeFrame(FRAME_W, FRAME_H, 20);
		drawRect(frame, CARD, 220);

		const rect = detectCardRect(frame);
		expect(rect).not.toBeNull();
		if (!rect) return;
		expect(rect.x).toBeGreaterThanOrEqual(CARD.x - 2);
		expect(rect.x).toBeLessThanOrEqual(CARD.x + 2);
		expect(rect.y).toBeGreaterThanOrEqual(CARD.y - 2);
		expect(rect.y).toBeLessThanOrEqual(CARD.y + 2);
		expect(rect.w).toBeGreaterThanOrEqual(CARD.w - 2);
		expect(rect.w).toBeLessThanOrEqual(CARD.w + 2);
		expect(rect.h).toBeGreaterThanOrEqual(CARD.h - 2);
		expect(rect.h).toBeLessThanOrEqual(CARD.h + 2);
	});

	test("detects a dark card on a bright background within +-2px", () => {
		const frame = makeFrame(FRAME_W, FRAME_H, 220);
		drawRect(frame, CARD, 20);

		const rect = detectCardRect(frame);
		expect(rect).not.toBeNull();
		if (!rect) return;
		expect(Math.abs(rect.x - CARD.x)).toBeLessThanOrEqual(2);
		expect(Math.abs(rect.y - CARD.y)).toBeLessThanOrEqual(2);
		expect(Math.abs(rect.w - CARD.w)).toBeLessThanOrEqual(2);
		expect(Math.abs(rect.h - CARD.h)).toBeLessThanOrEqual(2);
	});

	test("returns null for an empty (flat, cardless) frame", () => {
		const frame = makeFrame(FRAME_W, FRAME_H, 128);
		expect(detectCardRect(frame)).toBeNull();
	});

	test("returns null for a wrong-aspect region (wide banner, not a card)", () => {
		const frame = makeFrame(FRAME_W, FRAME_H, 20);
		// 140x40 -> aspect 3.5, area fraction 0.29: fails aspect, not area.
		drawRect(frame, { x: 10, y: 40, w: 140, h: 40 }, 220);
		expect(detectCardRect(frame)).toBeNull();
	});

	test("returns null for sparse noise (low fill inside a card-shaped bbox)", () => {
		const frame = makeFrame(FRAME_W, FRAME_H, 20);
		// Only every 11th pixel inside the card-shaped region goes bright (11
		// is coprime with FRAME_W=160, so the hits don't stripe-align across
		// rows), so row/col trimming still finds the card's footprint
		// (density is even) but the fill ratio inside that bbox is ~0.1,
		// well under FILL_MIN.
		const total = FRAME_W * FRAME_H;
		for (let i = 0; i < total; i += 11) {
			const x = i % FRAME_W;
			const y = Math.floor(i / FRAME_W);
			if (
				x >= CARD.x &&
				x < CARD.x + CARD.w &&
				y >= CARD.y &&
				y < CARD.y + CARD.h
			) {
				const o = i * 4;
				frame.data[o] = 220;
				frame.data[o + 1] = 220;
				frame.data[o + 2] = 220;
			}
		}
		expect(detectCardRect(frame)).toBeNull();
	});

	test("tolerates ~5% salt noise (bright card on dark bg)", () => {
		const frame = makeFrame(FRAME_W, FRAME_H, 20);
		drawRect(frame, CARD, 220);
		sprinkleNoise(frame, 19); // 19 is coprime with FRAME_W=160, ~5.3% density

		const rect = detectCardRect(frame);
		expect(rect).not.toBeNull();
		if (!rect) return;
		expect(Math.abs(rect.x - CARD.x)).toBeLessThanOrEqual(4);
		expect(Math.abs(rect.y - CARD.y)).toBeLessThanOrEqual(4);
		expect(Math.abs(rect.w - CARD.w)).toBeLessThanOrEqual(4);
		expect(Math.abs(rect.h - CARD.h)).toBeLessThanOrEqual(4);
	});

	test("tolerates ~5% salt noise (dark card on bright bg)", () => {
		const frame = makeFrame(FRAME_W, FRAME_H, 220);
		drawRect(frame, CARD, 20);
		sprinkleNoise(frame, 19);

		const rect = detectCardRect(frame);
		expect(rect).not.toBeNull();
		if (!rect) return;
		expect(Math.abs(rect.x - CARD.x)).toBeLessThanOrEqual(4);
		expect(Math.abs(rect.y - CARD.y)).toBeLessThanOrEqual(4);
		expect(Math.abs(rect.w - CARD.w)).toBeLessThanOrEqual(4);
		expect(Math.abs(rect.h - CARD.h)).toBeLessThanOrEqual(4);
	});
});
