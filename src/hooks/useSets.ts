import { useEffect } from "react";
import type { PokemonSet } from "../api";
import { useStore } from "../store";

export function useSets(): PokemonSet[] {
	const sets = useStore((s) => s.sets);
	const loadSets = useStore((s) => s.loadSets);

	useEffect(() => {
		loadSets();
	}, [loadSets]);

	return sets ?? [];
}
