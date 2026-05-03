import { useEffect } from "react";
import { useStore } from "../store";

interface FilterValues {
	types: string[];
	rarities: string[];
	supertypes: string[];
	subtypes: string[];
}

/**
 * Returns the four filter dimensions' available values, fetching them
 * lazily on first call. Same shape as usePokemonList — returns empty
 * arrays before the data lands so consumers can render placeholders
 * (or disabled chips) without null checks.
 */
export function useFilterValues(): FilterValues {
	const types = useStore((s) => s.types);
	const rarities = useStore((s) => s.rarities);
	const supertypes = useStore((s) => s.supertypes);
	const subtypes = useStore((s) => s.subtypes);
	const loadTypes = useStore((s) => s.loadTypes);
	const loadRarities = useStore((s) => s.loadRarities);
	const loadSupertypes = useStore((s) => s.loadSupertypes);
	const loadSubtypes = useStore((s) => s.loadSubtypes);

	useEffect(() => {
		loadTypes();
	}, [loadTypes]);
	useEffect(() => {
		loadRarities();
	}, [loadRarities]);
	useEffect(() => {
		loadSupertypes();
	}, [loadSupertypes]);
	useEffect(() => {
		loadSubtypes();
	}, [loadSubtypes]);

	return {
		types: types ?? [],
		rarities: rarities ?? [],
		supertypes: supertypes ?? [],
		subtypes: subtypes ?? [],
	};
}
