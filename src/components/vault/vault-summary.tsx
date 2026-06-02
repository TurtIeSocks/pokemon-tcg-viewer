import { useOwnedIndex } from "../../store/userland/selectors";

/** Count of distinct owned cards (≥1 copy). */
export function useOwnedCardCount(): number {
	return useOwnedIndex().size;
}
