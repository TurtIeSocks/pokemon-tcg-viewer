import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act, render, renderHook } from "@testing-library/react";
import { useUserland } from "../userland/userland-store";
import {
	useActiveI18n,
	useDisplayLanguage,
	useEnsureI18n,
} from "./i18n-active-hooks";
import {
	resetI18nRuntimeForTests,
	setI18nFetchersForTests,
	useI18nRuntime,
} from "./i18n-runtime";

/** Wait until the active i18n overlay reaches `lang`+ready (or time out). */
async function waitForI18n(lang: string, timeoutMs = 500): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const s = useI18nRuntime.getState();
		if (s.lang === lang && (lang === "en" || s.status === "ready")) return;
		await new Promise((r) => setTimeout(r, 5));
	}
}

// A tiny gzipped overlay for one language; build-i18n shape is [{id,name}].
const { gzipSync } = require("node:zlib") as typeof import("node:zlib");
const overlay = (records: { id: string; name: string }[]) => {
	const b = gzipSync(Buffer.from(JSON.stringify(records)));
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

function setProfileLanguage(lang: string | undefined): void {
	act(() => {
		useUserland.setState({
			profile:
				lang === undefined
					? null
					: ({
							id: "me",
							displayName: "Test",
							bio: null,
							avatarPreset: "dusk",
							favoriteSetId: null,
							displayLanguage: lang,
							createdAt: 1,
							updatedAt: 1,
							deletedAt: null,
							// biome-ignore lint/suspicious/noExplicitAny: minimal profile stub for the hook test
						} as any),
		});
	});
}

// useEnsureI18n reads the current route's `lang` via useSearch, so mount it in a
// real (memory) router. The root route validates a `lang` search param and calls
// the hook; the active overlay lands in the global i18n runtime, asserted via
// getState(). Returns the router so a test can navigate to change the URL lang.
function mountEnsureI18n(initialUrl: string) {
	const rootRoute = createRootRoute({
		validateSearch: (s: Record<string, unknown>) => ({
			lang: typeof s.lang === "string" ? s.lang : undefined,
		}),
		component: function Root() {
			useEnsureI18n();
			return null;
		},
	});
	const r = createRouter({
		routeTree: rootRoute,
		history: createMemoryHistory({ initialEntries: [initialUrl] }),
	});
	render(<RouterProvider router={r} />);
	return r;
}

beforeEach(async () => {
	await resetI18nRuntimeForTests();
	setI18nFetchersForTests({
		fetchVersion: async (lang) => ({
			version: `${lang}v1`,
			count: 1,
			builtAt: "x",
		}),
		fetchBlob: async (lang) =>
			overlay([
				{ id: "base1-4", name: lang === "fr" ? "Dracaufeu" : "Glurak" },
			]),
	});
	setProfileLanguage(undefined);
});

afterEach(async () => {
	await resetI18nRuntimeForTests();
	setProfileLanguage(undefined);
});

test("useDisplayLanguage normalizes the profile language to the supported set", () => {
	setProfileLanguage("ja"); // unsupported → en
	const { result, rerender } = renderHook(() => useDisplayLanguage());
	expect(result.current).toBe("en");

	setProfileLanguage("fr");
	rerender();
	expect(result.current).toBe("fr");
});

test("useEnsureI18n loads the overlay for the profile language (no URL override) and reacts to a switch", async () => {
	mountEnsureI18n("/"); // no `lang` param → profile drives it
	// No profile yet → en steady state, no overlay.
	expect(useI18nRuntime.getState().lang).toBe("en");

	// Switch the profile to fr → the effect must load the fr overlay.
	await act(async () => {
		setProfileLanguage("fr");
		await waitForI18n("fr");
	});
	expect(useI18nRuntime.getState().lang).toBe("fr");
	expect(useI18nRuntime.getState().namesById?.get("base1-4")).toBe("Dracaufeu");

	// Switch to de → overlay swaps.
	await act(async () => {
		setProfileLanguage("de");
		await waitForI18n("de");
	});
	expect(useI18nRuntime.getState().lang).toBe("de");
	expect(useI18nRuntime.getState().namesById?.get("base1-4")).toBe("Glurak");

	// Switch back to en → overlay clears.
	await act(async () => {
		setProfileLanguage("en");
		await waitForI18n("en");
	});
	expect(useI18nRuntime.getState().lang).toBe("en");
	expect(useI18nRuntime.getState().namesById).toBeNull();
});

test("useEnsureI18n: the URL lang overrides the profile default", async () => {
	setProfileLanguage("de"); // profile default = German
	const r = mountEnsureI18n("/?lang=fr"); // but this page's URL says French
	await act(async () => {
		await waitForI18n("fr");
	});
	// URL wins over the profile default.
	expect(useI18nRuntime.getState().lang).toBe("fr");
	expect(useI18nRuntime.getState().namesById?.get("base1-4")).toBe("Dracaufeu");

	// Clearing the URL override falls back to the profile language.
	await act(async () => {
		await r.navigate({ to: "/", search: {} });
		await waitForI18n("de");
	});
	expect(useI18nRuntime.getState().lang).toBe("de");
});

test("useActiveI18n returns null for en and the overlay for a loaded language", async () => {
	const { result, rerender } = renderHook(() => useActiveI18n());
	expect(result.current).toBeNull(); // en

	await act(async () => {
		useI18nRuntime.setState({
			lang: "fr",
			namesById: new Map([["base1-4", "Dracaufeu"]]),
			version: "frv1",
			status: "ready",
		});
		rerender();
	});
	expect(result.current?.lang).toBe("fr");
	expect(result.current?.namesById?.get("base1-4")).toBe("Dracaufeu");
});
