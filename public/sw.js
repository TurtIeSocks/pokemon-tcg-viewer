// Browse cache: caches viewed card images so browsed cards work offline and
// reload instantly. SCOPE IS wsrv.nl IMAGES ONLY — it must never touch app
// JS/HTML, or it would reintroduce the stale-chunk hydration crash class.
const HIRES_CAP = 100;
let thumbCap = 2000; // set by the page via postMessage; default until told

self.addEventListener("message", (e) => {
	if (e.data && e.data.type === "setThumbCap" && typeof e.data.cap === "number") {
		thumbCap = e.data.cap;
	}
});
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
	const url = new URL(e.request.url);
	if (e.request.method !== "GET" || url.hostname !== "wsrv.nl") return; // never app assets
	const w = url.searchParams.get("w");
	const name = w === "300" ? "ptcg-thumbs" : w === "734" ? "ptcg-hires" : null;
	if (!name) return;
	const cap = name === "ptcg-thumbs" ? thumbCap : HIRES_CAP;
	if (cap <= 0) return; // caching off
	e.respondWith(
		(async () => {
			const cache = await caches.open(name);
			const hit = await cache.match(e.request);
			if (hit) return hit;
			const res = await fetch(e.request);
			if (res.ok) {
				await cache.put(e.request, res.clone());
				const keys = await cache.keys();
				for (let i = 0; i < keys.length - cap; i++) await cache.delete(keys[i]);
			}
			return res;
		})(),
	);
});
