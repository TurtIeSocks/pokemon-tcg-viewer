import { useEffect } from "react";
import type { PokemonListEntry } from "../api";
import { useStore } from "../store";

export type { PokemonListEntry };

export function usePokemonList(): PokemonListEntry[] {
	const list = useStore((s) => s.pokemonList);
	const loadPokemonList = useStore((s) => s.loadPokemonList);

	useEffect(() => {
		loadPokemonList();
	}, [loadPokemonList]);

	return list ?? [];
}
