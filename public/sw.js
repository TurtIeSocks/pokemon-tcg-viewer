// Runtime caches, two independent concerns:
//  1. Browse cache  — wsrv.nl card images (thumbs/hires). UNCHANGED behaviour.
//  2. Shell cache   — same-origin app shell so the installed PWA works offline.
//
// Policy source of truth: src/store/offline-images/sw-shell-policy.ts. This file
// is a plain public/ asset and cannot import from src, so the routing rules are
// mirrored here — keep the two in sync. The rules are chosen so app assets are
// NEVER served stale-wrong (the "stale-chunk hydration crash" class): Vite
// content-hashes JS/CSS/font names, so cache-first on them is safe, and
// navigations are network-first so an online user always gets fresh SSR HTML.
const HIRES_CAP = 100;
let thumbCap = 2000; // set by the page via postMessage; default until told

const SHELL_CACHE = "ptcg-shell-v1"; // hashed assets + offline.html
const NAV_CACHE = "ptcg-nav-v1"; // cached navigation documents
const NAV_CAP = 60;
const OFFLINE_URL = "/offline.html";
const NEVER_CACHE = ["/_serverFn", "/api/", "/corpus"];
const KEEP_CACHES = [SHELL_CACHE, NAV_CACHE, "ptcg-thumbs", "ptcg-hires"];

self.addEventListener("message", (e) => {
	if (
		e.data &&
		e.data.type === "setThumbCap" &&
		typeof e.data.cap === "number"
	) {
		thumbCap = e.data.cap;
	}
});

self.addEventListener("install", (e) => {
	e.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL_CACHE);
			try {
				await cache.add(OFFLINE_URL);
			} catch {
				// A missing offline.html in some build state is non-fatal.
			}
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (e) => {
	e.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names.map((n) =>
					KEEP_CACHES.includes(n) ? undefined : caches.delete(n),
				),
			);
			await self.clients.claim();
		})(),
	);
});

async function trim(cacheName, cap) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	for (let i = 0; i < keys.length - cap; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
	const url = new URL(e.request.url);
	const req = e.request;

	// --- 1. Browse cache: wsrv.nl images (unchanged) ---
	if (req.method === "GET" && url.hostname === "wsrv.nl") {
		const w = url.searchParams.get("w");
		const name =
			w === "300" ? "ptcg-thumbs" : w === "734" ? "ptcg-hires" : null;
		if (!name) return;
		const cap = name === "ptcg-thumbs" ? thumbCap : HIRES_CAP;
		if (cap <= 0) return; // caching off
		e.respondWith(
			(async () => {
				const cache = await caches.open(name);
				const hit = await cache.match(req);
				if (hit) return hit;
				// CORS mode → non-opaque response so res.ok + content-length are
				// readable (needed for the settings byte count) and the body is
				// cacheable. wsrv.nl sends access-control-allow-origin: *.
				const res = await fetch(url.href, { mode: "cors" });
				if (res.ok) {
					await cache.put(req, res.clone());
					const keys = await cache.keys();
					for (let i = 0; i < keys.length - cap; i++)
						await cache.delete(keys[i]);
				}
				return res;
			})(),
		);
		return;
	}

	// --- 2. App shell (mirror of shellStrategy) ---
	if (req.method !== "GET") return;
	const sameOrigin = url.origin === self.location.origin;
	const dest = req.destination;
	const isNav = req.mode === "navigate" || dest === "document";

	// Navigations: network-first, fall back to a cached doc, then offline.html.
	if (isNav) {
		e.respondWith(
			(async () => {
				try {
					const res = await fetch(req);
					if (res?.ok) {
						const cache = await caches.open(NAV_CACHE);
						cache.put(req, res.clone());
						trim(NAV_CACHE, NAV_CAP);
					}
					return res;
				} catch {
					const cache = await caches.open(NAV_CACHE);
					const hit = await cache.match(req);
					if (hit) return hit;
					const shell = await caches.open(SHELL_CACHE);
					const offline = await shell.match(OFFLINE_URL);
					return offline || Response.error();
				}
			})(),
		);
		return;
	}

	if (!sameOrigin) return;
	if (NEVER_CACHE.some((p) => url.pathname.startsWith(p))) return;

	// Asset caching is disabled on localhost: the Vite dev server serves
	// unhashed module URLs (/src/*, /@vite/*), so cache-first would serve stale
	// modules after an edit and break HMR/reload. Only prod (hashed, immutable
	// filenames) is safe to cache-first. Navigations above stay active either way
	// so offline.html still works in dev. ponytail: hostname check, not a
	// build-injected flag — swap to a flag if prod ever runs on localhost.
	if (
		self.location.hostname === "localhost" ||
		self.location.hostname === "127.0.0.1"
	)
		return;

	// Hashed JS/CSS/fonts: cache-first (immutable names → stale-safe).
	if (dest === "script" || dest === "style" || dest === "font") {
		e.respondWith(
			(async () => {
				const cache = await caches.open(SHELL_CACHE);
				const hit = await cache.match(req);
				if (hit) return hit;
				const res = await fetch(req);
				if (res?.ok) cache.put(req, res.clone());
				return res;
			})(),
		);
		return;
	}

	// Same-origin images (icons, card-back): stale-while-revalidate.
	if (dest === "image") {
		e.respondWith(
			(async () => {
				const cache = await caches.open(SHELL_CACHE);
				const hit = await cache.match(req);
				const fetching = fetch(req)
					.then((res) => {
						if (res?.ok) cache.put(req, res.clone());
						return res;
					})
					.catch(() => hit);
				return hit || fetching;
			})(),
		);
		return;
	}
});
