#!/usr/bin/env bun
/**
 * One-off PNG generator for PWA icons. Reads public/favicon.svg, writes:
 *   public/icon-192.png
 *   public/icon-512.png
 *   public/icon-512-maskable.png  (padded to 80% per maskable-icon spec)
 *
 * Run once: `bun scripts/build-pwa-icons.ts`. The resulting PNGs are
 * committed to git; the script + Sharp dep stay for future re-renders.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const SVG_PATH = resolve(ROOT, "public/favicon.svg");

async function main(): Promise<void> {
	const svg = await readFile(SVG_PATH);

	// Standard square icons.
	for (const size of [192, 512] as const) {
		const out = await sharp(svg, { density: 384 })
			.resize(size, size, {
				fit: "contain",
				background: { r: 15, g: 8, b: 35, alpha: 1 },
			})
			.png()
			.toBuffer();
		await writeFile(resolve(ROOT, `public/icon-${size}.png`), out);
	}

	// Maskable: render the icon at ~80% inside a full safe area so it
	// survives platform masking. Add a solid background.
	const inner = await sharp(svg, { density: 384 })
		.resize(410, 410, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.toBuffer();
	const maskable = await sharp({
		create: {
			width: 512,
			height: 512,
			channels: 4,
			background: { r: 15, g: 8, b: 35, alpha: 1 },
		},
	})
		.composite([{ input: inner, gravity: "center" }])
		.png()
		.toBuffer();
	await writeFile(resolve(ROOT, "public/icon-512-maskable.png"), maskable);

	console.log("Wrote public/icon-{192,512,512-maskable}.png");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
