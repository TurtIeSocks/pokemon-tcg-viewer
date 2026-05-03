import { useEffect, useRef, useState } from "react";
import { getSets, type PokemonSet } from "../api";

export function useSets(): PokemonSet[] {
	const [sets, setSets] = useState<PokemonSet[]>([]);
	const didFetchRef = useRef(false);

	useEffect(() => {
		if (didFetchRef.current) return;
		didFetchRef.current = true;
		getSets()
			.then(setSets)
			.catch((e) => console.error(e));
	}, []);

	return sets;
}
