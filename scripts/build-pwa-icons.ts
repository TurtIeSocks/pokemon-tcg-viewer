#!/usr/bin/env bun
/**
 * Icon generator. Source: assets/ptcgv-logo.png (the app logo mark, kept
 * out of public/ so the 586KB original isn't shipped to dist/).
 * Writes, into public/:
 *   logo-64.png            — toolbar mark (transparent, 2x of ~32px display)
 *   favicon-16.png         — browser tab favicon (transparent)
 *   favicon-32.png         — browser tab favicon (transparent)
 *   apple-touch-icon.png   — iOS home screen (180, brand bg, padded)
 *   icon-192.png           — PWA (brand bg)
 *   icon-512.png           — PWA (brand bg)
 *   icon-512-maskable.png  — PWA maskable (logo at ~80% safe area, brand bg)
 *
 * Run once after changing the logo: `bun scripts/build-pwa-icons.ts`.
 * The resulting PNGs are committed; the script + Sharp dep stay for re-renders.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = resolve(ROOT, "assets/ptcgv-logo.png");
// Brand background (#0f0823) for icons that must not be transparent.
const BRAND = { r: 15, g: 8, b: 35, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

function out(name: string): string {
	return resolve(ROOT, "public", name);
}

async function main(): Promise<void> {
	const src = await readFile(SRC);

	// Transparent, contained-to-square marks (toolbar + tab favicons).
	for (const [name, size] of [
		["logo-64.png", 64],
		["favicon-16.png", 16],
		["favicon-32.png", 32],
	] as const) {
		const buf = await sharp(src)
			.resize(size, size, { fit: "contain", background: CLEAR })
			.png()
			.toBuffer();
		await writeFile(out(name), buf);
	}

	// PWA square icons: brand background, logo contained.
	for (const size of [192, 512] as const) {
		const buf = await sharp(src)
			.resize(size, size, { fit: "contain", background: BRAND })
			.flatten({ background: BRAND })
			.png()
			.toBuffer();
		await writeFile(out(`icon-${size}.png`), buf);
	}

	// apple-touch-icon: 180, brand bg, logo at ~88% with safe padding (iOS
	// masks to a rounded square, so leave breathing room and no transparency).
	const appleInner = await sharp(src)
		.resize(158, 158, { fit: "contain", background: CLEAR })
		.toBuffer();
	const apple = await sharp({
		create: { width: 180, height: 180, channels: 4, background: BRAND },
	})
		.composite([{ input: appleInner, gravity: "center" }])
		.png()
		.toBuffer();
	await writeFile(out("apple-touch-icon.png"), apple);

	// Maskable: logo at ~80% safe area on brand bg.
	const maskInner = await sharp(src)
		.resize(410, 410, { fit: "contain", background: CLEAR })
		.toBuffer();
	const maskable = await sharp({
		create: { width: 512, height: 512, channels: 4, background: BRAND },
	})
		.composite([{ input: maskInner, gravity: "center" }])
		.png()
		.toBuffer();
	await writeFile(out("icon-512-maskable.png"), maskable);

	console.log(
		"Wrote public/{logo-64,favicon-16,favicon-32,apple-touch-icon,icon-192,icon-512,icon-512-maskable}.png",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
