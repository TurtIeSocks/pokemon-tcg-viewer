import { useEffect } from "react";
import { useStore } from "../index";
import { loadCorpus } from "./corpus-runtime";

/** Trigger a one-time corpus + sets hydration on mount (idempotent). */
export function useEnsureCorpus(): void {
	const loadSets = useStore((s) => s.loadSets);
	useEffect(() => {
		void loadCorpus();
		void loadSets();
	}, [loadSets]);
}
