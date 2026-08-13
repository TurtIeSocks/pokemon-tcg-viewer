// Integrity guard: fail the build if the SSR bundle links a client asset that
// was never emitted.
//
// The two vite passes (client, then SSR) each resolve `src/app.css` to a
// content-hashed URL. If anything makes the CSS differ between passes, the SSR
// HTML ends up linking a stylesheet that does not exist, every page 404s its
// own stylesheet, and the app renders unstyled white until the client bundle
// boots and injects styles. Nothing else fails: the build is green, the server
// starts, the health check passes, and the only symptom is a white flash.
//
// Root cause the first time this shipped: `.gitignore` was excluded from the
// Docker build context. Tailwind v4's automatic source detection uses
// .gitignore to prune what it scans, so without it the second pass scanned the
// first pass's own build output, generated a different set of utilities, and
// hashed differently. That is one cause of a whole class — anything that makes
// the passes disagree produces the same silent break, so guard the invariant
// rather than the single cause.
//
// Run after `bun run build`:  bun run scripts/check-ssr-assets.ts

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SERVER_DIR = ".output/server";
const PUBLIC_DIR = ".output/public";

// Content-hashed stylesheets as they appear in the SSR bundle, e.g.
// "/assets/app-DZZwo7vx.css". Stylesheets only, deliberately: server chunks
// also carry "/assets/<name>.js" strings naming *themselves*, which have no
// counterpart under .output/public and are not what the document links.
const ASSET_REF = /\/assets\/[A-Za-z0-9._-]+\.css/g;

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, acc);
		else if (full.endsWith(".mjs") || full.endsWith(".js")) acc.push(full);
	}
	return acc;
}

function main(): void {
	let files: string[];
	try {
		files = walk(SERVER_DIR);
	} catch {
		console.error(
			`[check-ssr-assets] ${SERVER_DIR} not found — run \`bun run build\` first.`,
		);
		process.exit(1);
	}

	// Map each dangling reference to the server chunk that carries it, so a
	// failure names the file to go look at rather than just the missing hash.
	const dangling = new Map<string, string>();
	for (const file of files) {
		for (const ref of readFileSync(file, "utf8").matchAll(ASSET_REF)) {
			const url = ref[0];
			if (!dangling.has(url) && !existsSync(join(PUBLIC_DIR, url))) {
				dangling.set(url, file);
			}
		}
	}

	if (dangling.size > 0) {
		const lines = [...dangling].map(
			([url, file]) => `  ${url}\n    referenced by ${file}`,
		);
		console.error(
			`[check-ssr-assets] FAIL — the SSR bundle links stylesheets that are not in ${PUBLIC_DIR}:\n\n${lines.join(
				"\n",
			)}\n\nThe client and SSR passes disagreed on a content hash. Check anything that\nchanges what the build sees between passes — most likely Tailwind's source\ndetection, which prunes with .gitignore and so needs it present (this is why\n.dockerignore must not exclude .gitignore).\n`,
		);
		process.exit(1);
	}

	console.log(
		`[check-ssr-assets] OK — scanned ${files.length} server chunks, every linked stylesheet exists.`,
	);
}

main();
