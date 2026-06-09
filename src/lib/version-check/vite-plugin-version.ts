import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";
import { resolveVersion } from "./resolve-version";

function gitSha(): string | null {
	try {
		// execFileSync (no shell) with a fixed arg array — no injection surface.
		const out = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			stdio: ["ignore", "pipe", "ignore"],
		});
		return out.toString().trim() || null;
	} catch {
		return null;
	}
}

export interface VersionPluginOptions {
	/** Override the resolved token (CI / tests). */
	version?: string;
}

export function versionPlugin(options: VersionPluginOptions = {}): Plugin {
	// Read explicit keys: ProcessEnv is index-only and shares no named
	// properties with VersionEnv (TS2559) if passed directly.
	const env = {
		APP_VERSION: process.env.APP_VERSION,
		VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
		CF_PAGES_COMMIT_SHA: process.env.CF_PAGES_COMMIT_SHA,
		GITHUB_SHA: process.env.GITHUB_SHA,
	};
	const token = options.version ?? resolveVersion(env, gitSha);
	const payload = JSON.stringify({ version: token });
	let isSsr = false;

	return {
		name: "version-check",
		configResolved(resolved) {
			isSsr = Boolean(resolved.build.ssr);
		},
		config() {
			return { define: { __APP_VERSION__: JSON.stringify(token) } };
		},
		generateBundle() {
			// Emit only into the client bundle; the SSR build doesn't serve assets.
			if (isSsr) return;
			this.emitFile({
				type: "asset",
				fileName: "version.json",
				source: payload,
			});
		},
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (req.url && req.url.split("?")[0] === "/version.json") {
					res.setHeader("Content-Type", "application/json");
					res.setHeader("Cache-Control", "no-cache");
					res.end(payload);
					return;
				}
				next();
			});
		},
	};
}
