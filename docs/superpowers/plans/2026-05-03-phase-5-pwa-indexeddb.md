# Phase 5 — PWA + IndexedDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-5-pwa-indexeddb-design.md](../specs/2026-05-03-phase-5-pwa-indexeddb-design.md)

**Goal:** Ship a true installable PWA. Service worker caches built assets + images + API responses. Zustand persisted state moves from localStorage to IndexedDB with a one-time migration.

**Architecture:** `vite-plugin-pwa` (Workbox under the hood) for SW + manifest. Custom Zustand `PersistStorage` adapter backed by `idb-keyval`. Migration reads any v4 localStorage blob on first v5 load and copies into IDB. Two new tiny components for install + offline UI affordances.

**Tech Stack:** React 19, React Router 7 data router, Zustand 5 + persist, TypeScript, Vite 8 (+ `vite-plugin-pwa`), `idb-keyval`, Bun, Biome, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `scripts/build-pwa-icons.ts` — one-off Sharp script to render PNGs from favicon.svg
- `public/icon-192.png`
- `public/icon-512.png`
- `public/icon-512-maskable.png`
- `src/store/idb-storage.ts`
- `src/store/idb-storage.test.ts`
- `src/components/install-prompt/index.ts`
- `src/components/install-prompt/install-prompt.tsx`
- `src/components/install-prompt/install-prompt.test.tsx`
- `src/components/install-prompt/install-prompt.css`
- `src/components/offline-indicator/index.ts`
- `src/components/offline-indicator/offline-indicator.tsx`
- `src/components/offline-indicator/offline-indicator.test.tsx`
- `src/components/offline-indicator/offline-indicator.css`

**Modify:**
- `package.json` — add `idb-keyval`, `vite-plugin-pwa`, devDep `sharp`
- `vite.config.ts` — register `VitePWA(...)` plugin with manifest + runtime caching
- `index.html` — add theme-color + iOS meta tags
- `src/store/index.ts` — bump `STORAGE_VERSION` 4→5, swap to `createIdbStorage()`, no-op migrate at v5
- `src/root-layout.tsx` — mount `<InstallPrompt>` + `<OfflineIndicator>`

---

## Task 1: Install deps + generate PWA icons

**Files:**
- Modify: `package.json` + `bun.lock`
- Create: `scripts/build-pwa-icons.ts`
- Create: `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png`

- [ ] **Step 1.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```
Expected: worktree path + `phase-5/pwa`. Run `bun install` if `node_modules` absent.

- [ ] **Step 1.2: Add dependencies**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun add idb-keyval vite-plugin-pwa && bun add -d sharp
```

- [ ] **Step 1.3: Write the icon-generation script**

Create `scripts/build-pwa-icons.ts`:

```ts
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
			.resize(size, size, { fit: "contain", background: { r: 15, g: 8, b: 35, alpha: 1 } })
			.png()
			.toBuffer();
		await writeFile(resolve(ROOT, `public/icon-${size}.png`), out);
	}

	// Maskable: render the icon at ~80% inside a full safe area so it
	// survives platform masking. Add a solid background.
	const inner = await sharp(svg, { density: 384 })
		.resize(410, 410, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
```

- [ ] **Step 1.4: Run the script + verify PNG output**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun scripts/build-pwa-icons.ts
ls -la public/icon-*.png
file public/icon-192.png  # should report PNG image data
```

If `file` reports anything other than a valid PNG, debug. The output should look like:
```
public/icon-192.png: PNG image data, 192 x 192, 8-bit/color RGBA, non-interlaced
```

- [ ] **Step 1.5: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add package.json bun.lock scripts/build-pwa-icons.ts public/icon-192.png public/icon-512.png public/icon-512-maskable.png && git commit -m "feat(pwa): add idb-keyval + vite-plugin-pwa deps + PWA icons

Sharp generates 192/512/maskable PNGs from the existing favicon.svg.
Maskable icon pads to ~80% and adds a #0f0823 background for platform
masking. The script is kept for future re-renders; the outputs are
committed so the build doesn't need Sharp."
```

---

## Task 2: Configure vite-plugin-pwa + HTML meta tags

**Files:**
- Modify: `vite.config.ts`
- Modify: `index.html`

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```

- [ ] **Step 2.2: Update `vite.config.ts`**

```ts
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

export default defineConfig({
	base: "/pokemon-tcg-viewer/",
	plugins: [
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["favicon.svg"],
			manifest: {
				name: "Pokémon TCG Holo Playground",
				short_name: "Holo TCG",
				description: "Interactive Pokémon TCG card viewer",
				theme_color: "#0f0823",
				background_color: "#0f0823",
				display: "standalone",
				start_url: "/pokemon-tcg-viewer/",
				scope: "/pokemon-tcg-viewer/",
				icons: [
					{ src: "icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "icon-512.png", sizes: "512x512", type: "image/png" },
					{
						src: "icon-512-maskable.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				navigateFallback: "/pokemon-tcg-viewer/index.html",
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/api\.pokemontcg\.io\//,
						handler: "CacheFirst",
						options: {
							cacheName: "pokemontcg-api",
							expiration: { maxEntries: 200, maxAgeSeconds: SEVEN_DAYS },
						},
					},
					{
						urlPattern: /^https:\/\/images\.pokemontcg\.io\//,
						handler: "CacheFirst",
						options: {
							cacheName: "pokemontcg-images",
							expiration: { maxEntries: 500, maxAgeSeconds: THIRTY_DAYS },
						},
					},
				],
			},
		}),
	],
});
```

- [ ] **Step 2.3: Update `index.html`**

Read the existing file. Add the following inside `<head>`, after the existing `<meta name="viewport">`:

```html
<meta name="theme-color" content="#0f0823" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/pokemon-tcg-viewer/icon-192.png" />
```

(The manifest `<link>` is auto-injected by vite-plugin-pwa.)

- [ ] **Step 2.4: Verify build + manifest emission**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run typecheck && bun run lint && bun test && bun run build
ls dist/ | grep -E "manifest|sw|workbox"
```

Expected:
- 139 tests still pass (no app code changed yet)
- Typecheck clean
- Lint clean (only pre-existing warning)
- Build produces `dist/manifest.webmanifest`, `dist/sw.js`, `dist/registerSW.js`, `dist/workbox-*.js`
- `dist/index.html` contains a `<link rel="manifest">` tag and the theme-color meta

- [ ] **Step 2.5: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add vite.config.ts index.html && git commit -m "feat(pwa): configure vite-plugin-pwa + meta tags

manifest with standalone display + #0f0823 theme. Runtime cache:
pokemontcg.io API (cache-first, 7d) and images (cache-first, 30d).
autoUpdate SW registration. iOS meta tags for standalone mode."
```

---

## Task 3: IDB storage adapter (TDD)

**Files:**
- Create: `src/store/idb-storage.ts`
- Create: `src/store/idb-storage.test.ts`

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```

- [ ] **Step 3.2: Write the failing test**

Create `src/store/idb-storage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { del, get, set } from "idb-keyval";
import { createIdbStorage, IDB_KEY, LEGACY_LOCALSTORAGE_KEY } from "./idb-storage";

interface Sample {
	state: { hello: string };
	version: number;
}

beforeEach(async () => {
	await del(IDB_KEY);
	localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
});

afterEach(async () => {
	await del(IDB_KEY);
	localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
});

describe("createIdbStorage", () => {
	test("getItem returns null when IDB is empty and no legacy data exists", async () => {
		const storage = createIdbStorage<Sample["state"]>();
		const result = await storage.getItem("ignored");
		expect(result).toBeNull();
	});

	test("setItem then getItem round-trips the value", async () => {
		const storage = createIdbStorage<Sample["state"]>();
		const payload: Sample = { state: { hello: "world" }, version: 5 };
		await storage.setItem("ignored", payload);
		const result = await storage.getItem("ignored");
		expect(result).toEqual(payload);
	});

	test("getItem migrates from localStorage when IDB empty + legacy key present", async () => {
		const legacyPayload = { state: { hello: "legacy" }, version: 4 };
		localStorage.setItem(LEGACY_LOCALSTORAGE_KEY, JSON.stringify(legacyPayload));
		const storage = createIdbStorage<Sample["state"]>();
		const result = await storage.getItem("ignored");
		expect(result).toEqual(legacyPayload);
		// Migrated into IDB
		const inIdb = await get<string | undefined>(IDB_KEY);
		expect(inIdb).toBe(JSON.stringify(legacyPayload));
		// Legacy localStorage key removed
		expect(localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)).toBeNull();
	});
});
```

- [ ] **Step 3.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun test src/store/idb-storage.test.ts
```

Expected: FAIL with "Cannot find module './idb-storage'".

- [ ] **Step 3.4: Implement the adapter**

Create `src/store/idb-storage.ts`:

```ts
import { del, get, set } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";

export const IDB_KEY = "pokemon-tcg-viewer-state";
export const LEGACY_LOCALSTORAGE_KEY = "pokemon-tcg-viewer";

/**
 * Zustand PersistStorage adapter backed by idb-keyval. The first read on
 * v5 also migrates any legacy localStorage blob into IDB, then deletes
 * the legacy key so it doesn't ghost-rehydrate later. JSON-encodes the
 * value to match the original localStorage format.
 */
export function createIdbStorage<T>(): PersistStorage<T> {
	return {
		getItem: async (): Promise<StorageValue<T> | null> => {
			const value = await get<string | undefined>(IDB_KEY);
			if (value !== undefined) {
				try {
					return JSON.parse(value) as StorageValue<T>;
				} catch (e) {
					console.error("Failed to parse IDB payload; resetting", e);
					await del(IDB_KEY);
					return null;
				}
			}
			// Fallback: first load on v5. Migrate from localStorage if present.
			if (typeof localStorage === "undefined") return null;
			const legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
			if (legacy === null) return null;
			try {
				const parsed = JSON.parse(legacy) as StorageValue<T>;
				await set(IDB_KEY, legacy);
				localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
				return parsed;
			} catch (e) {
				console.error("Failed to migrate legacy localStorage; ignoring", e);
				localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
				return null;
			}
		},
		setItem: async (_name, value) => {
			await set(IDB_KEY, JSON.stringify(value));
		},
		removeItem: async () => {
			await del(IDB_KEY);
		},
	};
}
```

- [ ] **Step 3.5: Run tests pass**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun test src/store/idb-storage.test.ts
```
Expected: 3 pass.

- [ ] **Step 3.6: Verify full suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run typecheck && bun run lint && bun test
```
Expected: 142 pass (139 + 3).

- [ ] **Step 3.7: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add src/store/idb-storage.ts src/store/idb-storage.test.ts && git commit -m "feat(store): add IDB PersistStorage adapter with legacy migration

Wraps idb-keyval as Zustand's PersistStorage<T>. JSON-encodes values to
match the original localStorage format. On first read with empty IDB,
migrates any v4 localStorage blob and cleans up the legacy key.
Quiet-degrades on parse failure."
```

---

## Task 4: Migrate store to IDB at v5

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```

- [ ] **Step 4.2: Update `src/store/index.ts`**

Read the existing file (currently at `STORAGE_VERSION = 4`, composes ApiCacheSlice & CollectionSlice & PackCardsSlice). Modify:

```ts
import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";
import { createIdbStorage } from "./idb-storage";
import {
	type PackCardsSlice,
	createPackCardsSlice,
} from "./pack-cards-slice";

type AppStore = ApiCacheSlice & CollectionSlice & PackCardsSlice;

// Phase 5: substrate moves from localStorage to IndexedDB. The data shape
// is unchanged, so the v4→v5 migration is a no-op. The IDB adapter handles
// the one-time copy from localStorage on first v5 read.
const STORAGE_VERSION = 5;

const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createApiCacheSlice(set, get, store),
	...createCollectionSlice(set, get, store),
	...createPackCardsSlice(set, get, store),
});

export const useStore = create<AppStore>()(
	persist(composed, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		storage: createIdbStorage<AppStore>(),
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
			pokemonList: state.pokemonList,
			pokemonListFetchedAt: state.pokemonListFetchedAt,
			types: state.types,
			typesFetchedAt: state.typesFetchedAt,
			rarities: state.rarities,
			raritiesFetchedAt: state.raritiesFetchedAt,
			supertypes: state.supertypes,
			supertypesFetchedAt: state.supertypesFetchedAt,
			subtypes: state.subtypes,
			subtypesFetchedAt: state.subtypesFetchedAt,
			owned: state.owned,
			packCards: state.packCards,
			packCardsFetchedAt: state.packCardsFetchedAt,
		}),
		migrate: (persisted, version) => {
			let next = persisted as Partial<AppStore>;
			if (version < 3) next = { ...next, owned: {} };
			if (version < 4) next = { ...next, packCards: {}, packCardsFetchedAt: {} };
			// v4 → v5: substrate-only change; no field migration needed.
			return next as AppStore;
		},
	}),
);
```

- [ ] **Step 4.3: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run typecheck && bun run lint && bun test
```
Expected: 142 tests still pass. The persisted store now writes to IDB; tests that mutate `useStore.setState` directly are unaffected (in-memory state isn't routed through storage).

- [ ] **Step 4.4: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add src/store/index.ts && git commit -m "feat(store): swap persist storage to IndexedDB at v5

STORAGE_VERSION bumps 4→5. The migrate function is unchanged for the
field-shape path; the v4→v5 leg is substrate-only and handled in the
IDB adapter's first read. Legacy localStorage blob is auto-migrated."
```

---

## Task 5: `<InstallPrompt>` component (TDD)

**Files:**
- Create: `src/components/install-prompt/index.ts`
- Create: `src/components/install-prompt/install-prompt.tsx`
- Create: `src/components/install-prompt/install-prompt.test.tsx`
- Create: `src/components/install-prompt/install-prompt.css`

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```

- [ ] **Step 5.2: Write the failing test**

Create `src/components/install-prompt/install-prompt.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import { InstallPrompt } from "./install-prompt";

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function makeEvent(): BeforeInstallPromptEvent {
	const evt = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
	evt.prompt = async () => {};
	(evt as { userChoice: Promise<{ outcome: string }> }).userChoice = Promise.resolve({
		outcome: "accepted",
	});
	return evt;
}

afterEach(() => {
	// Reset by reloading the component on each test; no global teardown needed.
});

describe("<InstallPrompt />", () => {
	test("renders nothing by default", () => {
		const { container } = render(<InstallPrompt />);
		expect(container.querySelector(".install-prompt-button")).toBeNull();
	});

	test("renders Install button after beforeinstallprompt fires", () => {
		render(<InstallPrompt />);
		window.dispatchEvent(makeEvent());
		expect(
			screen.getByRole("button", { name: /install/i }),
		).toBeDefined();
	});

	test("click invokes the deferred prompt and hides the button", async () => {
		const evt = makeEvent();
		let calls = 0;
		evt.prompt = async () => {
			calls += 1;
		};
		render(<InstallPrompt />);
		window.dispatchEvent(evt);
		fireEvent.click(screen.getByRole("button", { name: /install/i }));
		// Allow the click handler's await to resolve
		await new Promise((r) => setTimeout(r, 0));
		expect(calls).toBe(1);
	});
});
```

- [ ] **Step 5.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun test src/components/install-prompt/install-prompt.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 5.4: Implement the component**

Create `src/components/install-prompt/install-prompt.tsx`:

```tsx
import { useEffect, useState } from "react";
import "./install-prompt.css";

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
		null,
	);

	useEffect(() => {
		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			setDeferred(e as BeforeInstallPromptEvent);
		};
		window.addEventListener("beforeinstallprompt", onBeforeInstall);
		return () =>
			window.removeEventListener("beforeinstallprompt", onBeforeInstall);
	}, []);

	if (!deferred) return null;

	return (
		<button
			type="button"
			className="install-prompt-button"
			onClick={async () => {
				await deferred.prompt();
				setDeferred(null);
			}}
		>
			Install app
		</button>
	);
}
```

- [ ] **Step 5.5: Create the index module**

Create `src/components/install-prompt/index.ts`:

```ts
export { InstallPrompt } from "./install-prompt";
```

- [ ] **Step 5.6: CSS**

Create `src/components/install-prompt/install-prompt.css`:

```css
.install-prompt-button {
	padding: 0.4rem 0.85rem;
	background: rgba(120, 100, 255, 0.22);
	border: 1px solid rgba(120, 100, 255, 0.55);
	border-radius: 999px;
	color: inherit;
	font-size: 0.8rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	cursor: pointer;
	transition: background 0.12s ease-out;
}

.install-prompt-button:hover,
.install-prompt-button:focus-visible {
	background: rgba(120, 100, 255, 0.36);
	outline: none;
}
```

- [ ] **Step 5.7: Run tests pass**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun test src/components/install-prompt/
```
Expected: 3 pass.

- [ ] **Step 5.8: Verify full suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run typecheck && bun run lint && bun test
```
Expected: 145 pass (142 + 3).

- [ ] **Step 5.9: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add src/components/install-prompt/ && git commit -m "feat(install-prompt): add 'Install app' button on beforeinstallprompt

Listens for the Chromium-only beforeinstallprompt event, defers the
prompt, renders a small pill button. Click invokes the deferred
prompt(); the button hides after the user choice resolves. iOS Safari
never fires this event so the button stays absent there."
```

---

## Task 6: `<OfflineIndicator>` component (TDD)

**Files:**
- Create: `src/components/offline-indicator/index.ts`
- Create: `src/components/offline-indicator/offline-indicator.tsx`
- Create: `src/components/offline-indicator/offline-indicator.test.tsx`
- Create: `src/components/offline-indicator/offline-indicator.css`

- [ ] **Step 6.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```

- [ ] **Step 6.2: Write the failing test**

Create `src/components/offline-indicator/offline-indicator.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";
import { OfflineIndicator } from "./offline-indicator";

afterEach(() => {
	// Reset navigator.onLine via property descriptor in case tests poked it
	Object.defineProperty(window.navigator, "onLine", {
		configurable: true,
		get: () => true,
	});
});

describe("<OfflineIndicator />", () => {
	test("renders nothing when navigator.onLine is true", () => {
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			get: () => true,
		});
		const { container } = render(<OfflineIndicator />);
		expect(container.querySelector(".offline-indicator")).toBeNull();
	});

	test("renders the 'Offline' chip after offline event fires", () => {
		Object.defineProperty(window.navigator, "onLine", {
			configurable: true,
			get: () => false,
		});
		render(<OfflineIndicator />);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(screen.getByText(/offline/i)).toBeDefined();
	});
});
```

- [ ] **Step 6.3: Run failing test**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun test src/components/offline-indicator/offline-indicator.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 6.4: Implement the component**

Create `src/components/offline-indicator/offline-indicator.tsx`:

```tsx
import { useEffect, useState } from "react";
import "./offline-indicator.css";

export function OfflineIndicator() {
	const [online, setOnline] = useState<boolean>(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);

	useEffect(() => {
		const onOnline = () => setOnline(true);
		const onOffline = () => setOnline(false);
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);
		return () => {
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
		};
	}, []);

	if (online) return null;

	return (
		<span className="offline-indicator" aria-live="polite">
			Offline
		</span>
	);
}
```

- [ ] **Step 6.5: Index + CSS**

`src/components/offline-indicator/index.ts`:

```ts
export { OfflineIndicator } from "./offline-indicator";
```

`src/components/offline-indicator/offline-indicator.css`:

```css
.offline-indicator {
	display: inline-block;
	padding: 0.25rem 0.65rem;
	background: rgba(255, 80, 80, 0.18);
	border: 1px solid rgba(255, 80, 80, 0.55);
	border-radius: 999px;
	color: rgba(255, 220, 220, 0.95);
	font-size: 0.75rem;
	font-weight: 600;
	letter-spacing: 0.05em;
	text-transform: uppercase;
}
```

- [ ] **Step 6.6: Run tests pass**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun test src/components/offline-indicator/
```
Expected: 2 pass.

- [ ] **Step 6.7: Verify full suite**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run typecheck && bun run lint && bun test
```
Expected: 147 pass (145 + 2).

- [ ] **Step 6.8: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add src/components/offline-indicator/ && git commit -m "feat(offline-indicator): add online/offline chip

Reads navigator.onLine, subscribes to window online/offline events.
Renders nothing when online; small red 'Offline' chip when offline.
aria-live='polite' for AT announcement on state change."
```

---

## Task 7: Wire both into `root-layout.tsx`

**Files:**
- Modify: `src/root-layout.tsx`
- Modify: `src/app.css` (if a sensible spot for the new chips' wrapper exists)

- [ ] **Step 7.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```

- [ ] **Step 7.2: Update `src/root-layout.tsx`**

Read the existing file. The primary-nav contains 3 `NavLink`s. Add the two new components inline at the end of the nav, separated by a flex spacer:

```tsx
import { NavLink, Outlet, ScrollRestoration } from "react-router";
import "./app.css";
import { InstallPrompt } from "./components/install-prompt";
import { OfflineIndicator } from "./components/offline-indicator";

export function RootLayout() {
	return (
		<div className="app">
			<ScrollRestoration />
			<nav className="primary-nav" aria-label="Filter mode">
				<NavLink to="/" end className={({ isActive }) => isActive ? "primary-nav-link active" : "primary-nav-link"}>
					By Set
				</NavLink>
				<NavLink to="/pokemon" className={({ isActive }) => isActive ? "primary-nav-link active" : "primary-nav-link"}>
					By Pokémon
				</NavLink>
				<NavLink to="/collection" className={({ isActive }) => isActive ? "primary-nav-link active" : "primary-nav-link"}>
					Collection
				</NavLink>
				<div className="primary-nav-spacer" />
				<OfflineIndicator />
				<InstallPrompt />
			</nav>
			<Outlet />
		</div>
	);
}
```

Preserve the existing exact className-by-isActive pattern for the NavLinks (read the file to confirm the exact callback shape; the snippet above is an approximation).

- [ ] **Step 7.3: Append CSS in `src/app.css`**

```css
.primary-nav-spacer {
	flex: 1;
}

.primary-nav {
	display: flex;
	align-items: center;
	gap: 0.6rem;
}
```

Read the existing `.primary-nav` rule first. If it already has `display: flex` and a gap, only add the `.primary-nav-spacer` rule and merge if appropriate.

- [ ] **Step 7.4: Verify**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 147 tests still pass. Build succeeds.

- [ ] **Step 7.5: Commit**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add src/root-layout.tsx src/app.css && git commit -m "feat(layout): mount InstallPrompt + OfflineIndicator in nav

Both render compactly to the right of the nav links, separated by a
flex spacer. Neither component shows by default; they appear only
when the corresponding browser events fire."
```

---

## Task 8: Final verification + smoke

**Files:** none.

- [ ] **Step 8.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && pwd && git branch --show-current
```

- [ ] **Step 8.2: Full check**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 147 pass / 0 fail. Typecheck clean. Lint shows only pre-existing warning. Build emits `dist/sw.js`, `dist/manifest.webmanifest`, `dist/registerSW.js`, `dist/workbox-*.js`.

- [ ] **Step 8.3: Manual smoke**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && bun run preview
```

In browser at `http://localhost:4173/pokemon-tcg-viewer/`:

1. Open devtools → Application → Manifest. See name, icons, theme.
2. Application → Service Workers. SW activated.
3. Add 3 cards to collection.
4. Application → IndexedDB → keyval-store → see `pokemon-tcg-viewer-state` with the persisted blob.
5. Reload. Collection persists.
6. Migration test: in devtools, set `localStorage.pokemon-tcg-viewer` to a sample v4 payload, delete IDB key, reload. Cards from the legacy blob appear; localStorage entry is gone afterward.
7. Offline test: devtools → Network → Offline. Reload. App still loads from precache. "Offline" chip appears in nav.
8. Toggle back online → chip disappears.
9. Install test (Chrome desktop): an install icon appears in the address bar; the inline "Install app" button also visible. Click either → install flow.

- [ ] **Step 8.4: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-5-pwa-indexeddb-design.md`. Change `**Status:** Approved (design)` to `**Status:** Implemented`.

Commit:

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-pwa && git add docs/superpowers/specs/2026-05-03-phase-5-pwa-indexeddb-design.md && git commit -m "docs: mark Phase 5 PWA spec as implemented"
```

---

## Done criteria

- [ ] All tasks 1–8 above checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass.
- [ ] Manual smoke confirms manifest, SW activation, IDB persist, legacy localStorage migration, offline chip, install button.
- [ ] Spec status reads "Implemented".
