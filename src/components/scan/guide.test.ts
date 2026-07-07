import { describe, expect, test } from "bun:test";
import {
	guideRect,
	nameRegion,
	numberRegion,
	numberRegionWide,
	ocrCropDims,
} from "./guide";

// R1: guide-frame alignment geometry (pure math, no DOM/camera).
const CARD_ASPECT = 63 / 88; // w:h

describe("guideRect", () => {
	test("landscape view centers card by height (height is limiting dimension)", () => {
		const viewW = 1000;
		const viewH = 600;
		const rect = guideRect(viewW, viewH);

		// height is limiting: guide height = 80% of viewH
		const expectedH = viewH * 0.8;
		const expectedW = expectedH * CARD_ASPECT;

		expect(rect.h).toBeCloseTo(expectedH, 5);
		expect(rect.w).toBeCloseTo(expectedW, 5);
		// centered
		expect(rect.x).toBeCloseTo((viewW - rect.w) / 2, 5);
		expect(rect.y).toBeCloseTo((viewH - rect.h) / 2, 5);
	});

	test("portrait view centers card by width (width is limiting dimension)", () => {
		const viewW = 400;
		const viewH = 900;
		const rect = guideRect(viewW, viewH);

		const expectedW = viewW * 0.8;
		const expectedH = expectedW / CARD_ASPECT;

		expect(rect.w).toBeCloseTo(expectedW, 5);
		expect(rect.h).toBeCloseTo(expectedH, 5);
		expect(rect.x).toBeCloseTo((viewW - rect.w) / 2, 5);
		expect(rect.y).toBeCloseTo((viewH - rect.h) / 2, 5);
	});

	test("maintains 63:88 aspect ratio regardless of viewport shape", () => {
		const rect = guideRect(1280, 720);
		expect(rect.w / rect.h).toBeCloseTo(CARD_ASPECT, 5);
	});
});

describe("nameRegion", () => {
	test("sits inside the guide: top 12% band, inset 8% horizontally", () => {
		const guide = { x: 100, y: 50, w: 200, h: 280 };
		const region = nameRegion(guide);

		const expectedX = guide.x + guide.w * 0.08;
		const expectedY = guide.y;
		const expectedW = guide.w * (1 - 0.16);
		const expectedH = guide.h * 0.12;

		expect(region.x).toBeCloseTo(expectedX, 5);
		expect(region.y).toBeCloseTo(expectedY, 5);
		expect(region.w).toBeCloseTo(expectedW, 5);
		expect(region.h).toBeCloseTo(expectedH, 5);
	});

	test("region bounds stay within the guide rect", () => {
		const guide = { x: 10, y: 20, w: 300, h: 420 };
		const region = nameRegion(guide);

		expect(region.x).toBeGreaterThanOrEqual(guide.x);
		expect(region.y).toBeGreaterThanOrEqual(guide.y);
		expect(region.x + region.w).toBeLessThanOrEqual(guide.x + guide.w + 1e-6);
		expect(region.y + region.h).toBeLessThanOrEqual(guide.y + guide.h + 1e-6);
	});
});

describe("numberRegion", () => {
	test("bottom-left strip: x=+2%w, y=+90%h, w=45%w, h=8%h", () => {
		const guide = { x: 100, y: 50, w: 200, h: 280 };
		const region = numberRegion(guide);

		expect(region.x).toBeCloseTo(guide.x + guide.w * 0.02, 5);
		expect(region.y).toBeCloseTo(guide.y + guide.h * 0.9, 5);
		expect(region.w).toBeCloseTo(guide.w * 0.45, 5);
		expect(region.h).toBeCloseTo(guide.h * 0.08, 5);
	});

	test("region bounds stay within the guide rect", () => {
		const guide = { x: 10, y: 20, w: 300, h: 420 };
		const region = numberRegion(guide);

		expect(region.x).toBeGreaterThanOrEqual(guide.x);
		expect(region.y).toBeGreaterThanOrEqual(guide.y);
		expect(region.x + region.w).toBeLessThanOrEqual(guide.x + guide.w + 1e-6);
		expect(region.y + region.h).toBeLessThanOrEqual(guide.y + guide.h + 1e-6);
	});
});

describe("numberRegionWide", () => {
	test("fallback spans full width of the guide: y+88%h, full w, 10%h", () => {
		const guide = { x: 100, y: 50, w: 200, h: 280 };
		const region = numberRegionWide(guide);

		expect(region.x).toBeCloseTo(guide.x, 5);
		expect(region.y).toBeCloseTo(guide.y + guide.h * 0.88, 5);
		expect(region.w).toBeCloseTo(guide.w, 5);
		expect(region.h).toBeCloseTo(guide.h * 0.1, 5);
	});

	test("spans the full width, not inset", () => {
		const guide = { x: 10, y: 20, w: 300, h: 420 };
		const region = numberRegionWide(guide);
		expect(region.x).toBeCloseTo(guide.x, 5);
		expect(region.w).toBeCloseTo(guide.w, 5);
	});
});

describe("ocrCropDims", () => {
	test("small crops upscale uniformly to the OCR floor", () => {
		const dims = ocrCropDims({ x: 0, y: 0, w: 100, h: 24 });
		expect(dims.h).toBe(96);
		expect(dims.w).toBe(400); // 4x uniform
	});
	test("large crops pass through untouched", () => {
		expect(ocrCropDims({ x: 0, y: 0, w: 500, h: 120 })).toEqual({
			w: 500,
			h: 120,
		});
	});
	test("degenerate rects stay positive", () => {
		const dims = ocrCropDims({ x: 0, y: 0, w: 0, h: 0 });
		expect(dims.w).toBeGreaterThanOrEqual(1);
		expect(dims.h).toBeGreaterThanOrEqual(1);
	});
});
