// Leak guard: fail the build if server-only code reached the client bundle.
//
// Root-caused 3× during the SSR migration: a server-only module (corpus loader,
// nav-tree server fn, card-resolve) got imported — directly or transitively —
// by a route/island in the client graph, dragging Node builtins + secrets into
// .output/public. In the browser `process.env.API_BASE` is undefined, so the
// corpus fetch fell back to the public API and 404'd.
//
// These markers must NEVER appear in the client bundle:
//   - `node:zlib` / `gunzipSync`  → Node builtin, can't run in a browser
//   - `process.env.API_BASE` / `{}.API_BASE`  → server runtime env, undefined client-side
//   - `/v2/sets`, `/v2/cards`  → raw pokemontcg.io paths (must go through server fns)
//
// Run after `bun run build`:  bun run scripts/check-client-bundle.ts
// Wired into the build via package.json so a leak fails CI/deploy loudly.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_DIR = ".output/public";

// Patterns that prove server-only code leaked. Each is a literal substring
// search against every built client asset.
const FORBIDDEN: { pattern: string; why: string }[] = [
	{
		pattern: "gunzipSync",
		why: "node:zlib (server gunzip) in the client bundle",
	},
	{ pattern: "node:zlib", why: "Node builtin import in the client bundle" },
	{
		pattern: "{}.API_BASE",
		why: "minified process.env.API_BASE (server runtime env)",
	},
	{
		pattern: "process.env.API_BASE",
		why: "server runtime env in the client bundle",
	},
	// The corpus loader's fingerprint: a /corpus fetch paired with the server
	// base. The CLIENT corpus fetch is fine (it uses VITE_API_BASE via
	// api-base-client); the SERVER one (corpus-server) must never ship.
	{
		pattern: "/corpus fetch failed",
		why: "corpus-server loader (server-only) in the client bundle",
	},
	// Billing (Phase C): Stripe + service_role secrets must never reach the client.
	// Value-shape markers survive minification (load-bearing); env-name markers are
	// best-effort (a name can appear without the secret leaking).
	{
		pattern: "sk_live_",
		why: "Stripe live secret key value in the client bundle",
	},
	{
		pattern: "sk_test_",
		why: "Stripe test secret key value in the client bundle",
	},
	{
		pattern: "whsec_",
		why: "Stripe webhook signing secret value in the client bundle",
	},
	{
		pattern: '"role":"service_role"',
		why: "service_role JWT (full RLS bypass) in the client bundle",
	},
	{
		pattern: "STRIPE_SECRET_KEY",
		why: "Stripe secret env-name in the client bundle (best-effort)",
	},
	{
		pattern: "SUPABASE_SERVICE_ROLE_KEY",
		why: "service_role env-name in the client bundle (best-effort)",
	},
];

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, acc);
		else if (full.endsWith(".js") || full.endsWith(".mjs")) acc.push(full);
	}
	return acc;
}

function main(): void {
	let files: string[];
	try {
		files = walk(PUBLIC_DIR);
	} catch {
		console.error(
			`[check-client-bundle] ${PUBLIC_DIR} not found — run \`bun run build\` first.`,
		);
		process.exit(1);
	}

	const leaks: string[] = [];
	for (const file of files) {
		const text = readFileSync(file, "utf8");
		for (const { pattern, why } of FORBIDDEN) {
			if (text.includes(pattern)) {
				leaks.push(`  ${file}\n    contains "${pattern}" — ${why}`);
			}
		}
	}

	if (leaks.length > 0) {
		console.error(
			`[check-client-bundle] FAIL — server-only code leaked into the client bundle:\n\n${leaks.join(
				"\n",
			)}\n\nFix: route loaders must call createServerFn wrappers (not raw server fns),\nand a client-reachable module must never import a server-only one.\n`,
		);
		process.exit(1);
	}

	console.log(
		`[check-client-bundle] OK — scanned ${files.length} client assets, no server-only leaks.`,
	);
}

main();
