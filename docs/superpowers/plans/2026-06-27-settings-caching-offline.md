# Settings Page + Caching & Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` route that homes the caching controls: relocate L1's card-detail download/evict off the sidebar dropdown, and add an always-on L3 browse cache (a `wsrv.nl`-only Service Worker that caches viewed card images into bounded FIFO caches) with a configurable thumbnail cap and evict.

**Architecture:** A new TanStack file route mirrors `/profile`. The sidebar dropdown's L1 toggle is replaced by a "Settings" link; L1's existing store/actions are reused by a settings-page control. A tiny static Service Worker (`public/sw.js`) intercepts only `wsrv.nl` image requests, caching `w=300` thumbnails (user-set cap) and `w=734` hires (fixed 100) FIFO. A page-side module + Zustand store drive the cap, stats, and evict; the SW learns the cap via `postMessage`.

**Tech Stack:** TanStack Start (file routes), Zustand, idb-keyval, Service Worker + Cache Storage API, bun test (happy-dom + fake-indexeddb), Biome.

## Global Constraints

- **No em-dashes in user-facing copy** (page titles, rendered text, menu labels). Use periods, commas, middle dot, or parentheses. Code/comments exempt.
- **The Service Worker NEVER intercepts non-`wsrv.nl` requests.** Hard guard on `url.hostname !== "wsrv.nl"`. This keeps it clear of app JS/HTML (the class of bug behind the PR #21 prod incident). Do not broaden the scope.
- **No `navigator.storage.persist()`** for the browse cache (best-effort by design).
- **Before writing or changing any Zustand store/selector, invoke the `zustand-subscription-patterns` skill.** New consumers use S3: per-field selectors in the consuming component.
- **Tests must not hit the network or touch a real Service Worker / Cache Storage.** Inject fakes (neither `caches` nor SW registration exists in happy-dom). In bun, prefer `spyOn` over `mock.module`.
- **Lint:** `bunx biome check --write --config-path=. <files>`. **Typecheck:** `bunx tsc -b`.
- Optional fields follow the corpus convention (`?`, omit when absent), not userland `null`.

---

## File Structure

- `src/routes/settings.tsx`, the `/settings` route shell (mirrors `/profile`).
- `src/components/settings/card-database-setting.tsx`, L1 controls relocated (reuses `useDetailRuntime`).
- `src/components/settings/image-cache-setting.tsx`, L3 cap select + status + evict.
- `src/components/shell/sidebar-user-menu.tsx`, remove the L1 dropdown toggle; add a Settings link.
- `src/components/shell/offline-toggle.tsx` + `offline-toggle.test.tsx`, DELETE (relocated).
- `public/sw.js`, the browse-cache Service Worker (static, self-contained).
- `src/store/offline-images/cache-policy.ts`, pure `imageCacheKindFor` + `evictionPlan` (tested; SW mirrors).
- `src/store/offline-images/browse-cache.ts`, page-side SW register + cap message + stats + prune + clear (with a test seam for `caches`).
- `src/store/offline-images/images-runtime.ts`, `useImageCache` store + actions; thumbCap persisted in idb-keyval.
- `src/routes/__root.tsx`, register the SW + send the cap at boot.

---

## Task 1: Settings route + relocate L1 controls

**Files:**
- Create: `src/routes/settings.tsx`
- Create: `src/components/settings/card-database-setting.tsx`
- Create: `src/components/settings/card-database-setting.test.tsx`
- Modify: `src/components/shell/sidebar-user-menu.tsx`
- Delete: `src/components/shell/offline-toggle.tsx`, `src/components/shell/offline-toggle.test.tsx`

**Interfaces:**
- Consumes: `useDetailRuntime` (state `status`, `syncedAt`) + actions `enableOffline`, `syncDetail`, `disableOffline`, `checkStale` from `@/store/corpus/detail-runtime` (already in main).
- Produces: a `/settings` route; `<CardDatabaseSetting />`.

- [ ] **Step 1: INVOKE the `zustand-subscription-patterns` skill** (CardDatabaseSetting subscribes to the store).

- [ ] **Step 2: Write the failing test**

Create `src/components/settings/card-database-setting.test.tsx`. Mirror the render harness used by `src/components/shell/offline-toggle.test.tsx` (which you are about to delete) and `src/components/card/card-detail.test.tsx` (bun:test + `@testing-library/react`). Drive state via `useDetailRuntime.setState`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { useDetailRuntime } from "@/store/corpus/detail-runtime";
import { CardDatabaseSetting } from "./card-database-setting";

test("shows the download CTA when off", () => {
	useDetailRuntime.setState({ status: "off", enabled: false });
	render(<CardDatabaseSetting />);
	expect(screen.getByText(/download/i)).toBeTruthy();
});

test("shows saved + a re-sync/remove when ready", () => {
	useDetailRuntime.setState({ status: "ready", enabled: true, syncedAt: 1 });
	render(<CardDatabaseSetting />);
	expect(screen.getByText(/saved/i)).toBeTruthy();
	expect(screen.getByText(/remove/i)).toBeTruthy();
});

test("shows update available when stale", () => {
	useDetailRuntime.setState({ status: "stale", enabled: true });
	render(<CardDatabaseSetting />);
	expect(screen.getByText(/update|re-?sync/i)).toBeTruthy();
});
```

(If the repo's harness differs, copy it from `offline-toggle.test.tsx` before deleting that file.)

- [ ] **Step 3: Run to verify failure**

Run: `bun test src/components/settings/card-database-setting.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `CardDatabaseSetting`**

Create `src/components/settings/card-database-setting.tsx`. Move the `relativeTime` helper out of the soon-deleted `offline-toggle.tsx` (verbatim):

```tsx
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import {
	checkStale,
	disableOffline,
	enableOffline,
	syncDetail,
	useDetailRuntime,
} from "@/store/corpus/detail-runtime";

const SIZE = "~2.1 MiB";

/** "3 days ago" / "yesterday" style label for the last sync. */
function relativeTime(ms: number): string {
	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	const min = Math.round((Date.now() - ms) / 60000);
	if (min < 60) return rtf.format(-min, "minute");
	const hr = Math.round(min / 60);
	if (hr < 24) return rtf.format(-hr, "hour");
	return rtf.format(-Math.round(hr / 24), "day");
}

/** Settings card for the offline card-detail database (L1). */
export function CardDatabaseSetting() {
	// S3: per-field selectors.
	const status = useDetailRuntime((s) => s.status);
	const syncedAt = useDetailRuntime((s) => s.syncedAt);
	// Staleness check on mount (this is L1's check, moved off the dropdown).
	useEffect(() => {
		void checkStale();
	}, []);

	const busy = status === "downloading" || status === "loading";
	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">Card database</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{status === "ready" && syncedAt
						? `Saved on this device. Synced ${relativeTime(syncedAt)}.`
						: status === "stale"
							? "Card data updated. Re-sync to refresh."
							: status === "error"
								? "Download failed."
								: `Battle data, rules, and flavor text for instant, offline card views (${SIZE}).`}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{status === "off" || status === "error" ? (
					<Button onClick={() => void enableOffline()} disabled={busy}>
						{status === "error" ? "Retry download" : `Download (${SIZE})`}
					</Button>
				) : null}
				{busy ? <Button disabled>Downloading...</Button> : null}
				{status === "stale" ? (
					<Button onClick={() => void syncDetail()}>Re-sync ({SIZE})</Button>
				) : null}
				{(status === "ready" || status === "stale") && (
					<Button variant="ghost" onClick={() => void disableOffline()}>
						Remove
					</Button>
				)}
			</div>
		</GlassPanel>
	);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `bun test src/components/settings/card-database-setting.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Create the settings route**

Create `src/routes/settings.tsx` (mirror `/profile`'s shape; title uses a non-em-dash separator):

```tsx
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CardDatabaseSetting } from "@/components/settings/card-database-setting";
import { Eyebrow } from "@/components/ui/eyebrow";
import { getNavTreeFn } from "../server/nav-tree";

export const Route = createFileRoute("/settings")({
	loader: () => getNavTreeFn(),
	head: () => ({ meta: [{ title: "Settings · Pokémon TCG" }] }),
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-8">
			<header className="flex flex-col gap-1">
				<Eyebrow>SETTINGS</Eyebrow>
				<h1 className="font-display text-3xl">Caching &amp; Offline</h1>
			</header>
			<ClientOnly fallback={null}>
				<CardDatabaseSetting />
			</ClientOnly>
		</div>
	);
}
```

- [ ] **Step 7: Swap the dropdown toggle for a Settings link**

In `src/components/shell/sidebar-user-menu.tsx`:
- Remove `import { OfflineToggle } from "./offline-toggle";` and `import { checkStale } from "@/store/corpus/detail-runtime";`.
- Remove the `onOpenChange={(open) => { if (open) void checkStale(); }}` from `<DropdownMenu>`.
- Remove the `<DropdownMenuGroup><OfflineToggle /></DropdownMenuGroup>` block and the `<DropdownMenuSeparator />` that followed it.
- Add `Settings` to the lucide import (`import { ... , Settings } from "lucide-react";`).
- In the action `DropdownMenuGroup`, add a Settings item directly above the "Edit profile" item:

```tsx
								<DropdownMenuItem asChild>
									<Link to="/settings" onClick={() => setOpenMobile(false)}>
										<Settings />
										Settings
									</Link>
								</DropdownMenuItem>
```

- [ ] **Step 8: Delete the relocated toggle**

```bash
git rm src/components/shell/offline-toggle.tsx src/components/shell/offline-toggle.test.tsx
```

- [ ] **Step 9: Regenerate the route tree, typecheck, run tests**

`routeTree.gen.ts` is gitignored and regenerated by the dev server / build. Run a typecheck which triggers route generation via the TanStack plugin is NOT automatic; instead run the build's route generation by starting nothing — just run `bunx tsc -b` and the test suite. If `tsc` errors on a missing `/settings` route type, run `bun run build 2>&1 | head -5` once to regenerate `src/routeTree.gen.ts`, then re-run `tsc`.

Run: `bunx tsc -b && bun test src/components/settings/card-database-setting.test.tsx src/components/shell/app-sidebar.test.tsx`
Expected: tsc clean, tests PASS (the sidebar test still passes without the toggle).

- [ ] **Step 10: Lint + commit**

Run: `bunx biome check --write --config-path=. src/routes/settings.tsx src/components/settings/card-database-setting.tsx src/components/settings/card-database-setting.test.tsx src/components/shell/sidebar-user-menu.tsx`

```bash
git add src/routes/settings.tsx src/components/settings/ src/components/shell/sidebar-user-menu.tsx
git commit -m "feat(settings): /settings page; relocate card-database controls off the dropdown"
```

---

## Task 2: Cache policy + browse-cache Service Worker

**Files:**
- Create: `src/store/offline-images/cache-policy.ts`
- Create: `src/store/offline-images/cache-policy.test.ts`
- Create: `public/sw.js`

**Interfaces:**
- Produces: `imageCacheKindFor(url: URL): { name: "ptcg-thumbs" | "ptcg-hires" } | null`; `evictionPlan<T>(keys: readonly T[], cap: number): T[]`. Cache names `ptcg-thumbs` / `ptcg-hires`. `HIRES_CAP = 100`.

- [ ] **Step 1: Write the failing test**

Create `src/store/offline-images/cache-policy.test.ts`:

```ts
import { expect, test } from "bun:test";
import { evictionPlan, imageCacheKindFor } from "./cache-policy";

test("imageCacheKindFor maps wsrv.nl image sizes to caches, rejects the rest", () => {
	expect(imageCacheKindFor(new URL("https://wsrv.nl/?url=x&w=300&output=webp"))?.name).toBe("ptcg-thumbs");
	expect(imageCacheKindFor(new URL("https://wsrv.nl/?url=x&w=734&output=webp"))?.name).toBe("ptcg-hires");
	expect(imageCacheKindFor(new URL("https://wsrv.nl/?url=x&w=999"))).toBeNull(); // unknown size
	expect(imageCacheKindFor(new URL("https://ptcg.turtlesocks.dev/assets/index.js"))).toBeNull(); // app asset
	expect(imageCacheKindFor(new URL("https://images.pokemontcg.io/base1/4.png"))).toBeNull(); // not the proxy
});

test("evictionPlan returns the oldest keys over cap, none when under", () => {
	expect(evictionPlan([1, 2, 3, 4, 5], 3)).toEqual([1, 2]); // delete 2 oldest
	expect(evictionPlan([1, 2], 3)).toEqual([]);
	expect(evictionPlan([1, 2, 3], 0)).toEqual([1, 2, 3]); // cap 0 = off, drop all
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/store/offline-images/cache-policy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the policy**

Create `src/store/offline-images/cache-policy.ts`:

```ts
export const THUMB_W = "300";
export const HIRES_W = "734";
export const THUMB_CACHE = "ptcg-thumbs";
export const HIRES_CACHE = "ptcg-hires";
export const HIRES_CAP = 100;

/**
 * Which browse cache an image request belongs to, or null if it is not a
 * cacheable wsrv.nl image. THIS IS THE SAME LOGIC public/sw.js applies inline;
 * keep them in sync. NEVER widen past wsrv.nl (app assets must not be cached).
 */
export function imageCacheKindFor(
	url: URL,
): { name: typeof THUMB_CACHE | typeof HIRES_CACHE } | null {
	if (url.hostname !== "wsrv.nl") return null;
	const w = url.searchParams.get("w");
	if (w === THUMB_W) return { name: THUMB_CACHE };
	if (w === HIRES_W) return { name: HIRES_CACHE };
	return null;
}

/** The oldest keys to delete so the cache holds at most `cap` (FIFO). */
export function evictionPlan<T>(keys: readonly T[], cap: number): T[] {
	const over = keys.length - Math.max(0, cap);
	return over > 0 ? keys.slice(0, over) : [];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/store/offline-images/cache-policy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the Service Worker**

Create `public/sw.js` (static, self-contained; mirrors `cache-policy.ts` inline). NOTE: the `hostname !== "wsrv.nl"` guard is load-bearing; never broaden it:

```js
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
```

- [ ] **Step 6: Commit**

Run: `bunx biome check --write --config-path=. src/store/offline-images/cache-policy.ts src/store/offline-images/cache-policy.test.ts`
(Do not lint `public/sw.js` with the app config; it is a plain SW global script. Leave it unformatted by biome or add it to biome ignore if biome complains.)

```bash
git add src/store/offline-images/cache-policy.ts src/store/offline-images/cache-policy.test.ts public/sw.js
git commit -m "feat(offline): browse-cache Service Worker + cache policy (wsrv.nl images only)"
```

---

## Task 3: Browse-cache page module + runtime store + boot register

**Files:**
- Create: `src/store/offline-images/browse-cache.ts`
- Create: `src/store/offline-images/browse-cache.test.ts`
- Create: `src/store/offline-images/images-runtime.ts`
- Create: `src/store/offline-images/images-runtime.test.ts`
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `cache-policy.ts` (Task 2), `idb-keyval`.
- Produces: `browse-cache.ts` exports `registerBrowseCacheSW()`, `sendThumbCap(cap)`, `cachedStats()` → `{ thumbs: number; hires: number; bytes: number }`, `pruneCache(name, cap)`, `clearImageCaches()`, `readThumbCap()`, `writeThumbCap(cap)`, `setBrowseCacheDepsForTests({ caches })`, `DEFAULT_THUMB_CAP = 2000`. `images-runtime.ts` exports `useImageCache` (`{ thumbCap, thumbs, hires, bytes, status: "idle" | "clearing" }`) + actions `loadThumbCap()`, `setThumbCap(cap)`, `refreshStats()`, `clearImages()`, plus `resetImagesForTests()`.

- [ ] **Step 1: INVOKE `zustand-subscription-patterns`.**

- [ ] **Step 2: Write the failing tests**

Create `src/store/offline-images/browse-cache.test.ts` (inject a fake Cache Storage):

```ts
import { beforeEach, expect, test } from "bun:test";
import {
	cachedStats,
	clearImageCaches,
	pruneCache,
	setBrowseCacheDepsForTests,
} from "./browse-cache";

function fakeCaches() {
	const stores = new Map<string, Map<string, { size: number }>>();
	const open = async (name: string) => {
		const m = stores.get(name) ?? new Map();
		stores.set(name, m);
		return {
			keys: async () => [...m.keys()].map((k) => new Request(k)),
			delete: async (req: Request) => m.delete(new Request(req).url),
			match: async (req: Request) => {
				const e = m.get(new Request(req).url);
				return e ? new Response("x", { headers: { "content-length": String(e.size) } }) : undefined;
			},
			put: async (req: Request, _res: Response) => m.set(new Request(req).url, { size: 1000 }),
		};
	};
	return { stores, api: { open, delete: async (n: string) => stores.delete(n) } };
}

beforeEach(() => {
	const f = fakeCaches();
	// @ts-expect-error minimal Cache stand-in
	setBrowseCacheDepsForTests({ caches: f.api });
	f.stores.set("ptcg-thumbs", new Map([["a", { size: 1000 }], ["b", { size: 1000 }], ["c", { size: 1000 }]]));
	f.stores.set("ptcg-hires", new Map([["h", { size: 2000 }]]));
});

test("cachedStats counts both caches and sums bytes", async () => {
	const s = await cachedStats();
	expect(s.thumbs).toBe(3);
	expect(s.hires).toBe(1);
	expect(s.bytes).toBe(5000); // 3*1000 + 1*2000
});

test("pruneCache deletes the oldest over cap", async () => {
	await pruneCache("ptcg-thumbs", 1);
	expect((await cachedStats()).thumbs).toBe(1);
});

test("clearImageCaches empties both", async () => {
	await clearImageCaches();
	const s = await cachedStats();
	expect(s.thumbs + s.hires).toBe(0);
});
```

Create `src/store/offline-images/images-runtime.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import { resetImagesForTests, setThumbCap, useImageCache } from "./images-runtime";

beforeEach(async () => {
	await resetImagesForTests();
});

test("setThumbCap persists and updates the store", async () => {
	await setThumbCap(500);
	expect(useImageCache.getState().thumbCap).toBe(500);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test src/store/offline-images/browse-cache.test.ts src/store/offline-images/images-runtime.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `browse-cache.ts`**

```ts
import { get, set } from "idb-keyval";
import {
	evictionPlan,
	HIRES_CACHE,
	HIRES_CAP,
	THUMB_CACHE,
} from "./cache-policy";

export const DEFAULT_THUMB_CAP = 2000;
const THUMB_CAP_KEY = "ptcg-thumb-cap";

// Injectable Cache Storage so tests never touch the real (absent) `caches`.
let cacheStorage: CacheStorage =
	typeof caches !== "undefined" ? caches : (undefined as unknown as CacheStorage);
export function setBrowseCacheDepsForTests(deps: { caches: CacheStorage }): void {
	cacheStorage = deps.caches;
}

export async function readThumbCap(): Promise<number> {
	return (await get<number>(THUMB_CAP_KEY)) ?? DEFAULT_THUMB_CAP;
}
export async function writeThumbCap(cap: number): Promise<void> {
	await set(THUMB_CAP_KEY, cap);
}

/** Register the browse-cache SW (idempotent). No-op without SW support. */
export async function registerBrowseCacheSW(): Promise<void> {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
	try {
		await navigator.serviceWorker.register("/sw.js");
	} catch {
		// registration failure is non-fatal; the app works without the cache.
	}
}

/** Tell the active SW the current thumbnail cap. */
export function sendThumbCap(cap: number): void {
	if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
	navigator.serviceWorker.controller.postMessage({ type: "setThumbCap", cap });
}

async function countAndBytes(name: string): Promise<{ count: number; bytes: number }> {
	const cache = await cacheStorage.open(name);
	const keys = await cache.keys();
	let bytes = 0;
	for (const req of keys) {
		const res = await cache.match(req);
		const len = res?.headers.get("content-length");
		if (len) bytes += Number(len);
	}
	return { count: keys.length, bytes };
}

export async function cachedStats(): Promise<{ thumbs: number; hires: number; bytes: number }> {
	const [t, h] = await Promise.all([countAndBytes(THUMB_CACHE), countAndBytes(HIRES_CACHE)]);
	return { thumbs: t.count, hires: h.count, bytes: t.bytes + h.bytes };
}

/** Trim a cache to at most `cap` entries, oldest first. */
export async function pruneCache(name: string, cap: number): Promise<void> {
	const cache = await cacheStorage.open(name);
	const keys = await cache.keys();
	for (const req of evictionPlan(keys, cap)) await cache.delete(req);
}

export async function clearImageCaches(): Promise<void> {
	await Promise.all([cacheStorage.delete(THUMB_CACHE), cacheStorage.delete(HIRES_CACHE)]);
}

export { HIRES_CAP };
```

- [ ] **Step 5: Implement `images-runtime.ts`**

```ts
import { create } from "zustand";
import {
	cachedStats,
	clearImageCaches,
	DEFAULT_THUMB_CAP,
	pruneCache,
	readThumbCap,
	sendThumbCap,
	writeThumbCap,
} from "./browse-cache";
import { THUMB_CACHE } from "./cache-policy";

interface ImageCacheState {
	thumbCap: number;
	thumbs: number;
	hires: number;
	bytes: number;
	status: "idle" | "clearing";
}

export const useImageCache = create<ImageCacheState>(() => ({
	thumbCap: DEFAULT_THUMB_CAP,
	thumbs: 0,
	hires: 0,
	bytes: 0,
	status: "idle",
}));

/** Boot: load the persisted cap and tell the SW. */
export async function loadThumbCap(): Promise<void> {
	const cap = await readThumbCap();
	useImageCache.setState({ thumbCap: cap });
	sendThumbCap(cap);
}

export async function setThumbCap(cap: number): Promise<void> {
	await writeThumbCap(cap);
	useImageCache.setState({ thumbCap: cap });
	sendThumbCap(cap);
	await pruneCache(THUMB_CACHE, cap); // immediate trim, do not wait for next fetch
	await refreshStats();
}

export async function refreshStats(): Promise<void> {
	const s = await cachedStats();
	useImageCache.setState({ thumbs: s.thumbs, hires: s.hires, bytes: s.bytes });
}

export async function clearImages(): Promise<void> {
	useImageCache.setState({ status: "clearing" });
	await clearImageCaches();
	useImageCache.setState({ status: "idle", thumbs: 0, hires: 0, bytes: 0 });
}

export async function resetImagesForTests(): Promise<void> {
	await writeThumbCap(DEFAULT_THUMB_CAP);
	useImageCache.setState({ thumbCap: DEFAULT_THUMB_CAP, thumbs: 0, hires: 0, bytes: 0, status: "idle" });
}
```

- [ ] **Step 6: Run to verify pass**

Run: `bun test src/store/offline-images/browse-cache.test.ts src/store/offline-images/images-runtime.test.ts`
Expected: PASS.

- [ ] **Step 7: Register the SW at boot**

In `src/routes/__root.tsx`, add a client-only boot effect near the existing `subscribeAuth` effect:

```tsx
	// Browse-cache Service Worker (always on; caches viewed card images).
	useEffect(() => {
		void (async () => {
			const { registerBrowseCacheSW } = await import("../store/offline-images/browse-cache");
			const { loadThumbCap } = await import("../store/offline-images/images-runtime");
			await registerBrowseCacheSW();
			await loadThumbCap();
		})();
	}, []);
```

(The dynamic import keeps these modules off the SSR path; this effect runs client-only inside the root component. This is NOT a server-fn module, so the dynamic-import-cycle hazard does not apply.)

- [ ] **Step 8: Typecheck + lint + commit**

Run: `bunx tsc -b && bunx biome check --write --config-path=. src/store/offline-images/browse-cache.ts src/store/offline-images/browse-cache.test.ts src/store/offline-images/images-runtime.ts src/store/offline-images/images-runtime.test.ts src/routes/__root.tsx`

```bash
git add src/store/offline-images/browse-cache.ts src/store/offline-images/browse-cache.test.ts src/store/offline-images/images-runtime.ts src/store/offline-images/images-runtime.test.ts src/routes/__root.tsx
git commit -m "feat(offline): browse-cache page module, runtime store, boot register"
```

---

## Task 4: Image cache settings card

**Files:**
- Create: `src/components/settings/image-cache-setting.tsx`
- Create: `src/components/settings/image-cache-setting.test.tsx`
- Modify: `src/routes/settings.tsx`

**Interfaces:**
- Consumes: `useImageCache` + `setThumbCap`, `refreshStats`, `clearImages` from `images-runtime.ts` (Task 3); `Select` from `@/components/ui/select`.
- Produces: `<ImageCacheSetting />`.

- [ ] **Step 1: INVOKE `zustand-subscription-patterns`.**

- [ ] **Step 2: Write the failing test**

Create `src/components/settings/image-cache-setting.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { useImageCache } from "@/store/offline-images/images-runtime";
import { ImageCacheSetting } from "./image-cache-setting";

test("shows cached stats and a clear control", () => {
	useImageCache.setState({ thumbCap: 2000, thumbs: 12, hires: 3, bytes: 5_000_000, status: "idle" });
	render(<ImageCacheSetting />);
	expect(screen.getByText(/12/)).toBeTruthy(); // thumbnail count surfaced
	expect(screen.getByText(/clear|evict/i)).toBeTruthy();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test src/components/settings/image-cache-setting.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `ImageCacheSetting`**

Create `src/components/settings/image-cache-setting.tsx`. Read the existing `@/components/ui/select` exports first and use them (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`):

```tsx
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	clearImages,
	refreshStats,
	setThumbCap,
	useImageCache,
} from "@/store/offline-images/images-runtime";

const PRESETS = [
	{ cap: 0, label: "Off" },
	{ cap: 500, label: "500 thumbnails (~12 MB)" },
	{ cap: 1000, label: "1000 thumbnails (~25 MB)" },
	{ cap: 2000, label: "2000 thumbnails (~50 MB)" },
	{ cap: 4000, label: "4000 thumbnails (~100 MB)" },
];

function mb(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Settings card for the always-on browse image cache (L3). */
export function ImageCacheSetting() {
	const thumbCap = useImageCache((s) => s.thumbCap);
	const thumbs = useImageCache((s) => s.thumbs);
	const hires = useImageCache((s) => s.hires);
	const bytes = useImageCache((s) => s.bytes);
	useEffect(() => {
		void refreshStats();
	}, []);

	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">Image cache</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					Cards you view are kept on this device so they load instantly and work
					offline. {thumbs} thumbnails and {hires} full images cached ({mb(bytes)}).
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Select
					value={String(thumbCap)}
					onValueChange={(v) => void setThumbCap(Number(v))}
				>
					<SelectTrigger className="w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESETS.map((p) => (
							<SelectItem key={p.cap} value={String(p.cap)}>
								{p.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button variant="ghost" onClick={() => void clearImages()}>
					Clear cache
				</Button>
			</div>
		</GlassPanel>
	);
}
```

(If the actual `Select` API differs, match `@/components/ui/select`'s real exports.)

- [ ] **Step 5: Run to verify pass**

Run: `bun test src/components/settings/image-cache-setting.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add it to the settings page**

In `src/routes/settings.tsx`, import `ImageCacheSetting` and render it inside the `<ClientOnly>` after `<CardDatabaseSetting />`:

```tsx
			<ClientOnly fallback={null}>
				<CardDatabaseSetting />
				<ImageCacheSetting />
			</ClientOnly>
```

- [ ] **Step 7: Typecheck + lint + commit**

Run: `bunx tsc -b && bunx biome check --write --config-path=. src/components/settings/image-cache-setting.tsx src/components/settings/image-cache-setting.test.tsx src/routes/settings.tsx`

```bash
git add src/components/settings/image-cache-setting.tsx src/components/settings/image-cache-setting.test.tsx src/routes/settings.tsx
git commit -m "feat(settings): image cache card (cap select, status, clear)"
```

---

## Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `bun test`
Expected: all pass (existing + new). If a new store test flakes across the suite (cross-file `caches`/IDB state), confirm each new test resets its deps in `beforeEach` (inject a fresh fake `caches`; reset the store).

- [ ] **Step 2: Typecheck**

Run: `bunx tsc -b`
Expected: clean.

- [ ] **Step 3: Build + leak guard**

Run: `bun run build:check`
Expected: build succeeds and `[check-client-bundle] OK`. Confirm `public/sw.js` is copied to `.output/public/sw.js` (it is a static asset) and that the leak guard does not flag it (it contains no node builtins or secrets).

- [ ] **Step 4: Manual smoke (dev server)**

Open the user menu, click Settings, confirm both cards render. Open a few cards (populates the image cache). In DevTools Application tab, confirm `ptcg-thumbs` / `ptcg-hires` caches fill and that NO app JS/HTML is cached. Go offline, reload, confirm a previously-viewed card still shows its image. Lower the cap in settings, confirm the thumbnail cache trims. Confirm the version-check toast still behaves (the SW must not interfere).

- [ ] **Step 5: Commit any fixups**

```bash
git add -A && git commit -m "chore: settings + caching verification pass" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- `/settings` route mirroring `/profile` → Task 1. ✓
- L1 controls relocated; dropdown toggle removed; Settings link added → Task 1. ✓
- Cache policy + `wsrv.nl`-only SW (two caches, FIFO, cap-by-`w`) → Task 2. ✓
- Page module (register/sendCap/stats/prune/clear) + runtime store + boot register → Task 3. ✓
- Image cache settings card (cap select, status, evict) → Task 4. ✓
- No persist; best-effort → enforced by omission (no `persist()` call anywhere); Global Constraints. ✓
- SW never touches app assets → `hostname` guard in Task 2 + `cache-policy` test asserting app/asset URLs map to null. ✓
- Tests inject fakes for `caches`/SW → Tasks 3/4. ✓

**Type consistency:** cache names `ptcg-thumbs`/`ptcg-hires` and `HIRES_CAP=100` defined in `cache-policy.ts` (Task 2), reused in `browse-cache.ts`/`sw.js` (Tasks 2/3). `useImageCache` state shape identical across Tasks 3/4. Action names (`setThumbCap`, `refreshStats`, `clearImages`, `loadThumbCap`) consistent across Tasks 3/4. `cachedStats()` return `{ thumbs, hires, bytes }` consistent.

**Placeholder scan:** no TBD/TODO; each code step has real code. The two "if the harness/API differs, match the real one" notes point at concrete existing files (`offline-toggle.test.tsx`, `@/components/ui/select`) rather than leaving anything open.
