import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act, render, renderHook } from "@testing-library/react";
import * as cardData from "../../server/card-data";
import { useStore } from "../index";
import { useUserland } from "../userland/userland-store";
import { buildIndex } from "./corpus-engine";
import { useCorpusRuntime } from "./corpus-runtime-store";
import type { CorpusCard } from "./corpus-types";
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

// A single card per region. Seeding BOTH region indices makes loadCorpus(region)
// early-return (it no-ops when that region is already loaded), so the region
// activation under test never touches the network.
const westCards: CorpusCard[] = [
	{
		id: "base1-4",
		name: "Charizard",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "base1",
		number: "4",
	},
];
const asiaCards: CorpusCard[] = [
	{
		id: "asia1-1",
		name: "Fushigidane",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "asia1",
		number: "1",
	},
];

function seedBothRegions(): void {
	act(() => {
		useCorpusRuntime.getState().setIndex("west", buildIndex(westCards, "west"));
		useCorpusRuntime.getState().setIndex("asia", buildIndex(asiaCards, "asia"));
		useCorpusRuntime.getState().setActiveRegion("west");
	});
}

function resetCorpusRegions(): void {
	useCorpusRuntime.setState({
		indices: {},
		activeRegion: "west",
		loading: {},
		index: null,
	});
}

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

// useEnsureI18n's region-activation effect also calls loadSetsForRegion, which
// delegates to getSetsFn -- a createServerFn wrapper that can't be invoked
// directly outside the TanStack Start server runtime in a unit test (see
// sets-slice.test.ts). Stub it globally here so every test in this file gets a
// quiet, resolved no-op by default; the dedicated test below installs its own
// spy (and asserts on it) instead of relying on this one.
let getSetsFnSpy: ReturnType<typeof spyOn> | undefined;

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
	resetCorpusRegions();
	// ALWAYS seed both region indices: useEnsureI18n's region-activation effect
	// fires `void loadCorpus(region)` on mount, and with an empty index that hits
	// the REAL network (apiBase() falls back to the prod worker). The un-awaited
	// promise then writes the live corpus into the shared fake-indexeddb and the
	// global corpus store — after this file's afterEach reset — breaking later
	// test files (corpus-runtime.test.ts saw 23k cards instead of its mocked 1).
	// Seeding makes loadCorpus early-return, so no test here touches the network.
	seedBothRegions();
	useStore.setState({ setsByRegion: {}, setsByRegionLoading: {} });
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue([]);
});

afterEach(async () => {
	await resetI18nRuntimeForTests();
	setProfileLanguage(undefined);
	resetCorpusRegions();
	getSetsFnSpy?.mockRestore();
	getSetsFnSpy = undefined;
});

test("useDisplayLanguage normalizes the profile language to the supported set", () => {
	setProfileLanguage("ru"); // unsupported → en
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

test("useEnsureI18n activates the asia region for an Asian URL lang, and back to west when it clears", async () => {
	// Both regions pre-seeded so loadCorpus(region) is a no-op (no network).
	seedBothRegions();
	expect(useCorpusRuntime.getState().activeRegion).toBe("west");

	// A page with ?lang=ja (an Asian language) must activate the asia region so
	// the browse grid derives against the asia index, not west.
	const r = mountEnsureI18n("/?lang=ja");
	await act(async () => {
		await waitForI18n("ja");
	});
	expect(useCorpusRuntime.getState().activeRegion).toBe("asia");
	// `index` now resolves the ACTIVE (asia) index, not west.
	expect(useCorpusRuntime.getState().index?.byId.has("asia1-1")).toBe(true);
	expect(useCorpusRuntime.getState().index?.byId.has("base1-4")).toBe(false);

	// Navigating to a Western language flips the active region back to west.
	await act(async () => {
		await r.navigate({ to: "/", search: { lang: "fr" } });
		await waitForI18n("fr");
	});
	expect(useCorpusRuntime.getState().activeRegion).toBe("west");
	expect(useCorpusRuntime.getState().index?.byId.has("base1-4")).toBe(true);
});

test("useEnsureI18n activates the asia region from an Asian PROFILE language (no URL param)", async () => {
	seedBothRegions();
	mountEnsureI18n("/"); // no ?lang → profile drives the region
	expect(useCorpusRuntime.getState().activeRegion).toBe("west");

	await act(async () => {
		setProfileLanguage("ko");
		await waitForI18n("ko");
	});
	expect(useCorpusRuntime.getState().activeRegion).toBe("asia");
});

test("useEnsureI18n also loads that region's SETS (not just its corpus index)", async () => {
	// loadSetsForRegion delegates to getSetsFn, a createServerFn wrapper that
	// can't be invoked directly outside the TanStack Start server runtime in a
	// unit test (see sets-slice.test.ts) -- spy it instead of letting the real
	// network path run, and assert the region-activation effect calls it with
	// the activated region, mirroring what it already does for loadCorpus.
	const loadSetsForRegionSpy = spyOn(
		useStore.getState(),
		"loadSetsForRegion",
	).mockResolvedValue(undefined);

	seedBothRegions();
	mountEnsureI18n("/?lang=ja");
	await act(async () => {
		await waitForI18n("ja");
	});

	expect(loadSetsForRegionSpy).toHaveBeenCalledWith("asia");
	loadSetsForRegionSpy.mockRestore();
});
