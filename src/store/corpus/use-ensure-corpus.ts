import { useEffect } from "react";
import type { Region } from "../../lib/languages";
import { useStore } from "../index";
import { loadCorpus } from "./corpus-runtime";

/** Trigger a one-time corpus + sets hydration on mount (idempotent). */
export function useEnsureCorpus(): void {
	const loadSets = useStore((s) => s.loadSets);
	useEffect(() => {
		if (typeof process !== "undefined" && process.env.NODE_ENV === "test")
			return;
		void loadCorpus();
		void loadSets();
	}, [loadSets]);
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
