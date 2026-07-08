# Version-update Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a manual "New version available → Reload" toast when an already-open tab is running a stale build, packaged as a portable, copy-out-able module.

**Architecture:** A Vite plugin stamps a build token two ways — frozen into the client bundle as `__APP_VERSION__`, and live into an emitted `/version.json`. A headless hook polls `/version.json` on focus/visibility/interval and flags staleness when the served token differs from the booted one. A null-rendering component wires that to a `sonner` toast with a `Reload` action. No service worker, no server state.

**Tech Stack:** TanStack Start + Vite 8 + Nitro, React 19, `sonner`, Bun test runner + happy-dom + `@testing-library/react`.

Spec: [docs/superpowers/specs/2026-06-09-version-update-toast-design.md](../specs/2026-06-09-version-update-toast-design.md)

---

## Prerequisites (fresh worktree)

Per project CLAUDE.md, before building/running in a worktree:
- `bun install` **in the worktree** (worktrees resolve `node_modules` upward to a stale base checkout otherwise).
- `cp ../../../.env .env` (`.env` is gitignored; absent in a new worktree).

`bun test` and `bunx tsc -b` work without these; `bun run dev`/`build` need them.

## File Structure

**New — `src/lib/version-check/` (the portable module):**
- `resolve-version.ts` — pure token resolver (`env SHA → git SHA → timestamp`). No Node imports. Lives in `tsconfig.app`, fully unit-tested.
- `resolve-version.test.ts` — unit tests for the resolver.
- `vite-plugin-version.ts` — the **only** Node-context file: imports `node:child_process`, owns the git call, calls `resolveVersion`, injects `__APP_VERSION__`, emits `version.json`, serves it in dev. Excluded from `tsconfig.app`, added to `tsconfig.node`.
- `version-check.d.ts` — ambient `declare const __APP_VERSION__: string`.
- `use-version-available.ts` — headless polling hook.
- `use-version-available.test.ts` — hook behavior tests.
- `version-toast.tsx` — null-rendering component; hook → toast. `notify` is dependency-injected (testable without spying ESM exports).
- `version-toast.test.tsx` — component test.
- `index.ts` — barrel: **runtime only** (hook + component). Plugin deliberately excluded so its Node code never enters the client graph.
- `README.md` — copy-out instructions.

**New — UI:**
- `src/components/ui/sonner.tsx` — themed `<Toaster>` (dark-only, Liquid-Glass tokens, no `next-themes`).

**Modified:**
- `vite.config.ts` — register `versionPlugin()`.
- `tsconfig.app.json` — exclude the plugin file.
- `tsconfig.node.json` — include the plugin file.
- `src/routes/__root.tsx` — mount `<Toaster />` + `<VersionToast />`.
- `package.json` / lockfile — add `sonner`.

---

## Task 1: Pure version resolver

**Files:**
- Create: `src/lib/version-check/resolve-version.ts`
- Test: `src/lib/version-check/resolve-version.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/version-check/resolve-version.test.ts`:

```ts
import { expect, test } from "bun:test";
import { resolveVersion } from "./resolve-version";

const NO_GIT = () => null;

test("explicit APP_VERSION wins and is not truncated", () => {
	expect(resolveVersion({ APP_VERSION: "1.4.2-rc1" }, NO_GIT)).toBe("1.4.2-rc1");
});

test("Vercel commit SHA is used and truncated to 7", () => {
	expect(
		resolveVersion({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }, NO_GIT),
	).toBe("abcdef1");
});

test("Cloudflare Pages SHA is used when Vercel absent", () => {
	expect(resolveVersion({ CF_PAGES_COMMIT_SHA: "0123456789" }, NO_GIT)).toBe(
		"0123456",
	);
});

test("GitHub SHA is used when others absent", () => {
	expect(resolveVersion({ GITHUB_SHA: "deadbeefcafe" }, NO_GIT)).toBe("deadbee");
});

test("falls back to git short SHA when no env source", () => {
	expect(resolveVersion({}, () => "feedfaceceded")).toBe("feedfac");
});

test("falls back to build timestamp when no env and no git", () => {
	expect(resolveVersion({}, NO_GIT, () => 1_749_456_789_000)).toBe(
		"1749456789000",
	);
});

test("precedence: APP_VERSION over CI SHAs over git", () => {
	expect(
		resolveVersion(
			{ APP_VERSION: "explicit", VERCEL_GIT_COMMIT_SHA: "aaaaaaa", GITHUB_SHA: "bbbbbbb" },
			() => "ccccccc",
		),
	).toBe("explicit");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/version-check/resolve-version.test.ts`
Expected: FAIL — `Cannot find module './resolve-version'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/version-check/resolve-version.ts`:

```ts
export interface VersionEnv {
	APP_VERSION?: string;
	VERCEL_GIT_COMMIT_SHA?: string;
	CF_PAGES_COMMIT_SHA?: string;
	GITHUB_SHA?: string;
}

/**
 * Resolve the build token. First non-empty wins:
 * explicit override → CI commit SHAs → local git → build timestamp.
 * SHAs are truncated to 7 chars; an explicit override and the timestamp are not.
 */
export function resolveVersion(
	env: VersionEnv,
	runGit: () => string | null,
	now: () => number = () => Date.now(),
): string {
	if (env.APP_VERSION) return env.APP_VERSION;
	const sha =
		env.VERCEL_GIT_COMMIT_SHA ||
		env.CF_PAGES_COMMIT_SHA ||
		env.GITHUB_SHA ||
		runGit();
	return sha ? sha.slice(0, 7) : String(now());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/version-check/resolve-version.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/version-check/resolve-version.ts src/lib/version-check/resolve-version.test.ts
git commit -m "feat(version-check): pure build-token resolver" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Vite plugin + ambient decl + tsconfig wiring

No unit test (Vite-plugin integration is verified at build time in Task 7; the resolver it calls is covered in Task 1 — accepted deviation per spec).

**Files:**
- Create: `src/lib/version-check/vite-plugin-version.ts`
- Create: `src/lib/version-check/version-check.d.ts`
- Modify: `tsconfig.app.json` (add `exclude`)
- Modify: `tsconfig.node.json` (add plugin to `include`)

- [ ] **Step 1: Create the ambient declaration**

Create `src/lib/version-check/version-check.d.ts` (no imports/exports — keep it a global script):

```ts
// Injected by vite-plugin-version at build time; frozen per build.
declare const __APP_VERSION__: string;
```

- [ ] **Step 2: Create the plugin**

Create `src/lib/version-check/vite-plugin-version.ts`:

```ts
import { execSync } from "node:child_process";
import type { Plugin } from "vite";
import { resolveVersion } from "./resolve-version";

function gitSha(): string | null {
	try {
		const out = execSync("git rev-parse --short HEAD", {
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
	const token = options.version ?? resolveVersion(process.env, gitSha);
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
```

- [ ] **Step 3: Exclude the plugin from the app tsconfig**

The plugin imports `node:child_process`; `tsconfig.app.json`'s types are only `["vite/client", "bun-types"]`. Add an `exclude` so the app project doesn't typecheck it. Edit `tsconfig.app.json` — add this key as a sibling of `"include"`:

```json
	"include": ["src"],
	"exclude": ["src/lib/version-check/vite-plugin-version.ts"]
```

- [ ] **Step 4: Include the plugin in the node tsconfig**

Edit `tsconfig.node.json` `include` (which already lists `vite.config.ts` + `./scripts/*.ts`) to add the plugin so it typechecks under `["node", "bun"]` types:

```json
	"include": ["vite.config.ts", "./scripts/*.ts", "src/lib/version-check/vite-plugin-version.ts"]
```

- [ ] **Step 5: Typecheck**

Run: `bunx tsc -b`
Expected: PASS. (Confirms the plugin typechecks under node types, the ambient `__APP_VERSION__` is visible to `src`, and the app project ignores the plugin file.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/version-check/vite-plugin-version.ts src/lib/version-check/version-check.d.ts tsconfig.app.json tsconfig.node.json
git commit -m "feat(version-check): vite plugin stamps token + emits version.json" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Polling hook `useVersionAvailable`

**Files:**
- Create: `src/lib/version-check/use-version-available.ts`
- Test: `src/lib/version-check/use-version-available.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/version-check/use-version-available.test.ts`:

```tsx
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useVersionAvailable } from "./use-version-available";

function mockFetch(version: string, ok = true) {
	return spyOn(globalThis, "fetch").mockResolvedValue({
		ok,
		json: async () => ({ version }),
	} as unknown as Response);
}

function setVisibility(state: "visible" | "hidden") {
	Object.defineProperty(document, "visibilityState", {
		value: state,
		configurable: true,
	});
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).__APP_VERSION__ = "boot-v1";
	setVisibility("visible");
});

afterEach(() => {
	mock.restore();
	setVisibility("visible");
	delete (globalThis as Record<string, unknown>).__APP_VERSION__;
});

test("flags an update when the served version differs from boot", async () => {
	mockFetch("new-v2");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(result.current.updateReady).toBe(true));
	expect(result.current.latestVersion).toBe("new-v2");
});

test("no update when the served version equals boot", async () => {
	const f = mockFetch("boot-v1");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(f).toHaveBeenCalled());
	expect(result.current.updateReady).toBe(false);
});

test("never flags on a rejected fetch", async () => {
	const f = spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(f).toHaveBeenCalled());
	expect(result.current.updateReady).toBe(false);
});

test("never flags on a non-200 response", async () => {
	const f = mockFetch("new-v2", false);
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(f).toHaveBeenCalled());
	expect(result.current.updateReady).toBe(false);
});

test("dismiss suppresses the current token until a newer one ships", async () => {
	const f = mockFetch("new-v2");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	await waitFor(() => expect(result.current.updateReady).toBe(true));

	act(() => result.current.dismiss());
	expect(result.current.updateReady).toBe(false);

	// Same token again → stays suppressed.
	f.mockResolvedValue({
		ok: true,
		json: async () => ({ version: "new-v2" }),
	} as unknown as Response);
	window.dispatchEvent(new Event("focus"));
	await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(1));
	expect(result.current.updateReady).toBe(false);

	// Newer token → flags again.
	f.mockResolvedValue({
		ok: true,
		json: async () => ({ version: "new-v3" }),
	} as unknown as Response);
	window.dispatchEvent(new Event("focus"));
	await waitFor(() => expect(result.current.updateReady).toBe(true));
	expect(result.current.latestVersion).toBe("new-v3");
});

test("a focus event triggers a re-check", async () => {
	const f = mockFetch("boot-v1");
	renderHook(() => useVersionAvailable({ enabled: true, intervalMs: 10_000 }));
	await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
	window.dispatchEvent(new Event("focus"));
	await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(1));
});

test("does not poll on an interval while the tab is hidden", async () => {
	setVisibility("hidden");
	const f = mockFetch("boot-v1");
	renderHook(() => useVersionAvailable({ enabled: true, intervalMs: 20 }));
	await waitFor(() => expect(f).toHaveBeenCalledTimes(1)); // mount check only
	await new Promise((r) => setTimeout(r, 80));
	expect(f).toHaveBeenCalledTimes(1); // no interval growth while hidden
});

test("becoming visible starts the interval", async () => {
	setVisibility("hidden");
	const f = mockFetch("boot-v1");
	renderHook(() => useVersionAvailable({ enabled: true, intervalMs: 20 }));
	await waitFor(() => expect(f).toHaveBeenCalledTimes(1));

	setVisibility("visible");
	document.dispatchEvent(new Event("visibilitychange"));
	await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(2));
});

test("disabled hook never fetches", async () => {
	const f = mockFetch("new-v2");
	const { result } = renderHook(() =>
		useVersionAvailable({ enabled: false, intervalMs: 10_000 }),
	);
	await new Promise((r) => setTimeout(r, 40));
	expect(f).not.toHaveBeenCalled();
	expect(result.current.updateReady).toBe(false);
});

test("aborts the in-flight request on unmount", async () => {
	const abortSpy = spyOn(AbortController.prototype, "abort");
	mockFetch("new-v2");
	const { unmount } = renderHook(() =>
		useVersionAvailable({ enabled: true, intervalMs: 10_000 }),
	);
	unmount();
	expect(abortSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/version-check/use-version-available.test.ts`
Expected: FAIL — `Cannot find module './use-version-available'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/version-check/use-version-available.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseVersionAvailableOptions {
	/** Endpoint serving `{ version }`. Default `/version.json`. */
	url?: string;
	/** Foreground poll interval in ms. Default 60_000. */
	intervalMs?: number;
	/** Master switch. Default: on outside dev. */
	enabled?: boolean;
}

export interface VersionAvailable {
	updateReady: boolean;
	latestVersion: string | null;
	dismiss: () => void;
}

function bootVersion(): string {
	// Vite replaces the bare token at build; guard for non-Vite runtimes (tests).
	return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
}

export function useVersionAvailable(
	options: UseVersionAvailableOptions = {},
): VersionAvailable {
	const {
		url = "/version.json",
		intervalMs = 60_000,
		enabled = !import.meta.env.DEV,
	} = options;

	const boot = useRef(bootVersion());
	const dismissed = useRef<string | null>(null);
	const latest = useRef<string | null>(null);
	const [updateReady, setUpdateReady] = useState(false);
	const [latestVersion, setLatestVersion] = useState<string | null>(null);

	const check = useCallback(
		async (signal: AbortSignal) => {
			try {
				const res = await fetch(`${url}?t=${Date.now()}`, {
					cache: "no-store",
					signal,
				});
				if (!res.ok) return;
				const data = (await res.json()) as { version?: unknown };
				const version =
					typeof data.version === "string" ? data.version : null;
				if (version === null || signal.aborted) return;
				latest.current = version;
				setLatestVersion(version);
				setUpdateReady(
					version !== boot.current && version !== dismissed.current,
				);
			} catch {
				// offline / aborted / parse failure → never surface as an update
			}
		},
		[url],
	);

	useEffect(() => {
		if (!enabled) return;

		let controller: AbortController | null = null;
		const run = () => {
			controller?.abort();
			controller = new AbortController();
			void check(controller.signal);
		};

		let timer: ReturnType<typeof setInterval> | null = null;
		const startTimer = () => {
			if (timer === null) timer = setInterval(run, intervalMs);
		};
		const stopTimer = () => {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
		};

		const onVisibility = () => {
			if (document.visibilityState === "visible") {
				run();
				startTimer();
			} else {
				stopTimer();
			}
		};

		run();
		if (document.visibilityState === "visible") startTimer();
		window.addEventListener("focus", run);
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			controller?.abort();
			stopTimer();
			window.removeEventListener("focus", run);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [enabled, intervalMs, check]);

	const dismiss = useCallback(() => {
		dismissed.current = latest.current;
		setUpdateReady(false);
	}, []);

	return { updateReady, latestVersion, dismiss };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/version-check/use-version-available.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/version-check/use-version-available.ts src/lib/version-check/use-version-available.test.ts
git commit -m "feat(version-check): polling hook with focus/visibility triggers + dismiss" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: sonner Toaster (dark-only, Liquid-Glass themed)

Equivalent to `shadcn add sonner` minus `next-themes` (the app is dark-only and has no `next-themes`). Hand-write the wrapper to avoid the CLI pulling that dep.

**Files:**
- Modify: `package.json` (`bun add sonner`)
- Create: `src/components/ui/sonner.tsx`

- [ ] **Step 1: Add the dependency**

Run: `bun add sonner`
Expected: `sonner` appears in `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Create the themed Toaster**

Create `src/components/ui/sonner.tsx`:

```tsx
import { Toaster as Sonner, type ToasterProps } from "sonner";
import type { CSSProperties } from "react";

/**
 * Dark-only sonner Toaster themed to the Liquid-Glass tokens. No next-themes —
 * the app has a single dark canvas. `--normal-*` are sonner's own theming vars;
 * none are self-referential (which would hang happy-dom).
 */
export function Toaster(props: ToasterProps) {
	return (
		<Sonner
			theme="dark"
			position="bottom-right"
			className="toaster group"
			style={
				{
					"--normal-bg": "var(--glass)",
					"--normal-text": "var(--ink)",
					"--normal-border": "rgba(255,255,255,0.1)",
				} as CSSProperties
			}
			toastOptions={{
				classNames: {
					toast:
						"group border border-white/10 bg-(--glass) backdrop-blur-xl text-(--ink) shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)]",
					description: "text-(--ink-muted)",
					actionButton:
						"bg-(--primary) text-(--primary-ink) rounded-(--r-pill)",
					cancelButton: "bg-(--glass) text-(--ink-muted)",
				},
			}}
			{...props}
		/>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/sonner.tsx package.json bun.lock
git commit -m "feat(ui): add sonner Toaster themed to Liquid Glass (dark-only)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `VersionToast` component

`notify` is dependency-injected so the test drives it without spying ESM exports (which are read-only and break `spyOn`; `mock.module` is banned in this worktree).

**Files:**
- Create: `src/lib/version-check/version-toast.tsx`
- Test: `src/lib/version-check/version-toast.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/version-check/version-toast.test.tsx`:

```tsx
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { VersionToast } from "./version-toast";

beforeEach(() => {
	(globalThis as Record<string, unknown>).__APP_VERSION__ = "boot-v1";
});

afterEach(() => {
	mock.restore();
	delete (globalThis as Record<string, unknown>).__APP_VERSION__;
});

test("fires a toast with a Reload action when an update is available", async () => {
	const fetchMock = mock(async () => ({
		ok: true,
		json: async () => ({ version: "new-v2" }),
	}));
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const notify = mock((_message: string, _data?: unknown) => "id");
	render(
		<VersionToast
			notify={notify}
			options={{ enabled: true, intervalMs: 10_000 }}
		/>,
	);

	await waitFor(() => expect(notify).toHaveBeenCalled());
	const [message, data] = notify.mock.calls[0] as [
		string,
		{ action: { label: string }; duration: number },
	];
	expect(message).toBe("New version available");
	expect(data.action.label).toBe("Reload");
	expect(data.duration).toBe(Number.POSITIVE_INFINITY);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/version-check/version-toast.test.tsx`
Expected: FAIL — `Cannot find module './version-toast'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/version-check/version-toast.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { toast as sonnerToast } from "sonner";
import {
	type UseVersionAvailableOptions,
	useVersionAvailable,
} from "./use-version-available";

type Notify = (
	message: string,
	data?: Parameters<typeof sonnerToast>[1],
) => unknown;

export interface VersionToastProps {
	/** Injectable for tests; defaults to sonner's `toast`. */
	notify?: Notify;
	options?: UseVersionAvailableOptions;
}

export function VersionToast({
	notify = sonnerToast,
	options,
}: VersionToastProps = {}) {
	const { updateReady, latestVersion, dismiss } = useVersionAvailable(options);
	const shown = useRef<string | null>(null);

	useEffect(() => {
		if (!updateReady || latestVersion === null) return;
		if (shown.current === latestVersion) return;
		shown.current = latestVersion;
		notify("New version available", {
			id: "app-version",
			description: "Reload to get the latest.",
			duration: Number.POSITIVE_INFINITY,
			action: { label: "Reload", onClick: () => window.location.reload() },
			onDismiss: dismiss,
		});
	}, [updateReady, latestVersion, dismiss, notify]);

	return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/version-check/version-toast.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/version-check/version-toast.tsx src/lib/version-check/version-toast.test.tsx
git commit -m "feat(version-check): VersionToast wires hook to a sonner Reload toast" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Barrel + README (portability deliverable)

**Files:**
- Create: `src/lib/version-check/index.ts`
- Create: `src/lib/version-check/README.md`

- [ ] **Step 1: Create the barrel (runtime only — no plugin)**

Create `src/lib/version-check/index.ts`:

```ts
export {
	type UseVersionAvailableOptions,
	type VersionAvailable,
	useVersionAvailable,
} from "./use-version-available";
export { type VersionToastProps, VersionToast } from "./version-toast";
```

> The plugin is intentionally **not** re-exported here — it imports `node:child_process` and must never enter the client graph. Import it directly from `./vite-plugin-version` in `vite.config.ts`.

- [ ] **Step 2: Create the README**

Create `src/lib/version-check/README.md`:

```markdown
# version-check

Toast the user when a newer build has been deployed. Poll-based, no service worker.

## How it works

A Vite plugin stamps a build token two ways:
- **frozen** into the client bundle as `__APP_VERSION__`,
- **live** into an emitted `/version.json`.

`useVersionAvailable()` polls `/version.json` on focus / visibility / interval and
flags staleness when the served token differs from the booted one. `<VersionToast/>`
renders that as a sonner toast with a manual **Reload** action (never auto-reloads).

## Drop into another Vite + React app

1. Copy this folder.
2. Register the plugin (import **directly**, not via the barrel):
   ```ts
   // vite.config.ts
   import { versionPlugin } from "./src/lib/version-check/vite-plugin-version";
   export default defineConfig({ plugins: [versionPlugin()] });
   ```
3. Ensure `version-check.d.ts` is covered by your tsconfig `include`. If your build
   plugin needs Node types your app tsconfig lacks, exclude
   `vite-plugin-version.ts` from the app project and add it to a node tsconfig.
4. Mount once in your root layout:
   ```tsx
   import { Toaster } from "@/components/ui/sonner";
   import { VersionToast } from "@/lib/version-check";
   // ... <VersionToast /> <Toaster />
   ```
5. `bun add sonner`.

## Token source

`resolve-version.ts` resolves: `APP_VERSION` → `VERCEL_GIT_COMMIT_SHA` →
`CF_PAGES_COMMIT_SHA` → `GITHUB_SHA` → local `git rev-parse --short HEAD` →
build timestamp.

## Caching note

The client fetches `/version.json?t=<now>` with `cache: "no-store"` to dodge the
browser cache and most CDNs. On an aggressive CDN, also send `Cache-Control:
no-cache` on `/version.json`, or serve it from a no-cache server route.

## Options

`useVersionAvailable({ url?, intervalMs?, enabled? })` — defaults `/version.json`,
`60_000`ms, and on outside dev. The interval only runs while the tab is visible.
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/version-check/index.ts src/lib/version-check/README.md
git commit -m "feat(version-check): barrel exports + copy-out README" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire into the app

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Register the plugin**

In `vite.config.ts`, add the import near the other plugin imports:

```ts
import { versionPlugin } from "./src/lib/version-check/vite-plugin-version";
```

Add `versionPlugin()` to the `plugins` array (after `nitro()`):

```ts
		viteReact(),
		nitro(),
		versionPlugin(),
	],
```

- [ ] **Step 2: Mount Toaster + VersionToast**

In `src/routes/__root.tsx`, add imports alongside the existing `@/` imports:

```ts
import { Toaster } from "@/components/ui/sonner";
import { VersionToast } from "@/lib/version-check";
```

Replace the existing client-only block in `RootComponent`:

```tsx
			<ClientOnly fallback={null}>
				<CardOverlay />
			</ClientOnly>
```

with:

```tsx
			<ClientOnly fallback={null}>
				<CardOverlay />
				<VersionToast />
				<Toaster />
			</ClientOnly>
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc -b`
Expected: PASS.

- [ ] **Step 4: Build and verify the asset + define**

Run: `bun run build`
Expected: build succeeds.

Run: `find . -name version.json -not -path '*/node_modules/*'`
Expected: at least one emitted `version.json` in the build output (e.g. under `.output/public/`). Confirm its contents are `{"version":"<token>"}`:

```bash
cat "$(find . -name version.json -not -path '*/node_modules/*' | head -1)"
```

Expected: a JSON object with a non-empty `version`.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts src/routes/__root.tsx
git commit -m "feat(version-check): register plugin + mount toast in root" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run lint, typecheck, and the module's tests in parallel**

Run (single batch — independent, per project CLAUDE.md):
- `bunx biome check --write --config-path=. src/lib/version-check/ src/components/ui/sonner.tsx src/routes/__root.tsx`
- `bunx tsc -b`
- `bun test src/lib/version-check/`

Expected: biome clean (no diagnostics after `--write`), `tsc -b` PASS, all version-check tests PASS (19 across the three test files).

- [ ] **Step 2: Run the full test suite once (phase boundary)**

Run: `bun test`
Expected: PASS — no regressions in existing suites (no network leak; these tests don't render card grids, so no corpus pre-seed needed).

- [ ] **Step 3: Commit any lint fixups**

```bash
git add -A src/lib/version-check src/components/ui/sonner.tsx src/routes/__root.tsx
git commit -m "chore(version-check): lint pass" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "nothing to commit"
```

---

## Self-review

**Spec coverage:**
- Detection = version-poll → Tasks 2 (plugin/token + endpoint) + 3 (hook). ✅
- Manual sticky toast → Task 5 (`duration: Infinity`, Reload action, `onDismiss`). ✅
- Self-contained module → Tasks 1–6 under `src/lib/version-check/` + README. ✅
- sonner install + dark/glass theming, strip next-themes → Task 4. ✅
- Mounts in `__root.tsx` inside `ClientOnly` → Task 7. ✅
- No-cache / cache-bust → hook fetch (`?t=` + `no-store`, Task 3) + README note. ✅
- Barrel excludes plugin (keeps Node out of client graph) → Task 6. ✅
- Tests: resolver, hook (all listed cases), component → Tasks 1, 3, 5. Plugin not unit-tested (build-verified Task 7) — matches spec's accepted deviation. ✅

**Placeholder scan:** none — every step has full code/commands/expected output.

**Type consistency:** `resolveVersion(env, runGit, now?)` identical across Task 1 def + Task 2 call. `UseVersionAvailableOptions`/`VersionAvailable` defined Task 3, consumed Tasks 5/6. `VersionToastProps.notify: Notify` matches the test's `mock((message, data?) => ...)` shape. `versionPlugin()` factory signature consistent Tasks 2 + 7. `__APP_VERSION__` declared once (Task 2), read in Task 3, set on `globalThis` in tests. ✅
