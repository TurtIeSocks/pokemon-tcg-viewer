import { useEffect } from "react";
import type { Region } from "../../lib/languages";
import { useStore } from "../index";
import { loadCorpus } from "./corpus-runtime";
import { useCorpusRuntime } from "./corpus-runtime-store";

/**
 * Trigger a one-time corpus + sets hydration on mount (idempotent). Always
 * ensures the "west" base corpus (the app's default), and ALSO ensures
 * `activeRegion`'s corpus when that differs from "west" (e.g. the user
 * switched to an Asian display language earlier in the session, which sets
 * `activeRegion` via `i18n-active-hooks.ts`'s `loadCorpus(region)` +
 * `setActiveRegion(region)`, then deep-links straight into a route -- /scan
 * among them -- before any other route's `loadCorpus("asia")` call has run).
 * `loadCorpus` is idempotent per region within a session, so this is a
 * no-op when that region is already loaded.
 */
export function useEnsureCorpus(): void {
	const loadSets = useStore((s) => s.loadSets);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	useEffect(() => {
		if (typeof process !== "undefined" && process.env.NODE_ENV === "test")
			return;
		void loadCorpus();
		if (activeRegion !== "west") void loadCorpus(activeRegion);
		void loadSets();
	}, [loadSets, activeRegion]);
}

/**
 * Trigger a one-time load of `region`'s base corpus on mount (idempotent —
 * `loadCorpus` no-ops if that region is already loaded). Use this to lazily
 * pull in the Asian-region corpus from a component that needs it (e.g. once
 * the user picks an Asian display language), without paying for it up front.
 */
export function useEnsureRegionCorpus(region: Region): void {
	useEffect(() => {
		if (typeof process !== "undefined" && process.env.NODE_ENV === "test")
			return;
		void loadCorpus(region);
	}, [region]);
}
