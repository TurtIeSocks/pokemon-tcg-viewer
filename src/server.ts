// Custom TanStack Start server entry.
//
// WHY THIS EXISTS — deploy-safe HTML shell. Route loaders + server fns set
// Cache-Control via `setResponseHeader` during SSR (src/server/nav-tree.ts,
// src/server/corpus-server.ts). Those writes share one per-request header bag
// and the Start handler overlays them onto the FINAL document Response, so the
// unhashed HTML shell ends up with `stale-while-revalidate`. That lets the
// browser serve the OLD shell (which references the OLD content-hashed JS and
// therefore the OLD __APP_VERSION__) on the first post-deploy load — the cause
// of the "update available" toast reappearing and needing a second reload.
//
// This is the one choke point that runs AFTER every loader/server-fn has
// finalized the Response, so it authoritatively overrides every leak for ALL
// route classes in one place (vs. whack-a-mole edits to each leaking server fn,
// any of which a future loader could silently reintroduce).
//
// SCOPE: only `text/html` documents are rewritten. Hashed assets
// (application/javascript|text/css, `immutable, max-age=1yr`), `/version.json`
// (application/json), and server-fn JSON/RPC responses are left untouched, so
// asset immutability and SSR data caching are preserved.
//
// `no-cache` = the browser may store the shell but MUST revalidate it (cheap
// ETag/conditional request) before reuse — no stale serving, single-reload
// deploys. (`no-store` would forbid storing entirely; not needed here.)
import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { paraglideMiddleware } from "./paraglide/server.js";

const handler = createStartHandler(defaultStreamHandler);

export default {
	async fetch(request: Request, opts?: unknown) {
		return paraglideMiddleware(
			request,
			async ({ request: localizedRequest }) => {
				const res = await handler(localizedRequest, opts as never);
				const contentType = res.headers.get("content-type") ?? "";
				if (contentType.includes("text/html")) {
					res.headers.set("Cache-Control", "no-cache, must-revalidate");
				}
				return res;
			},
		);
	},
};
