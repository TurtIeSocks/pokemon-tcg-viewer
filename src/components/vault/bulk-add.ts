import type { CorpusIndex } from "../../store/corpus/corpus-engine";

export function cardIdsInSets(index: CorpusIndex, setIds: string[]): string[] {
	const want = new Set(setIds);
	return index.cards.filter((c) => want.has(c.setId)).map((c) => c.id);
}

export function partitionUnowned(
	cardIds: string[],
	ownedCardIds: Set<string>,
): { toAdd: string[]; skipped: number } {
	const toAdd = cardIds.filter((id) => !ownedCardIds.has(id));
	return { toAdd, skipped: cardIds.length - toAdd.length };
}
