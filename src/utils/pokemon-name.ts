import type { PokemonListEntry } from "../server/card-mappers";
import { displayName } from "./display-name";

/**
 * Look up a Pokémon's display name from the pokeapi.co list, indexed by
 * national pokédex number (1-indexed). Returns null if the list isn't
 * loaded yet or the number is out of range.
 */
export function pokemonNameByDex(
	list: PokemonListEntry[] | null,
	pokedexNumber: number,
): string | null {
	if (!list) return null;
	if (pokedexNumber < 1 || pokedexNumber > list.length) return null;
	const entry = list[pokedexNumber - 1];
	return displayName(entry.name);
}
