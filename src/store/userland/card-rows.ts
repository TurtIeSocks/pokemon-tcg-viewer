import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import {
	type CorpusIndex,
	hydrateCard,
	type I18nOverlay,
} from "../corpus/corpus-engine";
import { compareCardNumber } from "../corpus/natural-compare";
import { groupByCardId, sumQuantity } from "./group";
import type { Stack } from "./types";

/** Column the collection table is sorted by. */
export type SortKey = "set" | "acquired" | "price" | "year";
/** Sort direction for the collection table. */
export type SortDir = "asc" | "desc";
/** One row in the collection table: the display card, all stacks, and the representative stack used for sorting. */
export interface CardRow {
	/** Corpus card data for display (image, name, set info). */
	card: HoloCardData;
	/** Every owned stack for this card. */
	stacks: Stack[];
	/**
	 * The stack used for sort keys (acquiredAt, pricePaid).
	 * isPrimary wins; otherwise the earliest createdAt stack.
	 */
	primary: Stack;
	/** Total cards owned for this card (= sum of stack quantities). */
	count: number;
}

/**
 * Build one CardRow per distinct owned card.
 * Cards whose id is not found in the corpus index are silently dropped.
 */
export function buildCardRows(
	items: Stack[],
	index: CorpusIndex,
	setsById: Map<string, PokemonSet>,
	i18n?: I18nOverlay | null,
): CardRow[] {
	const byCard = groupByCardId(items);
	const rows: CardRow[] = [];
	for (const [cardId, stacks] of byCard) {
		const cc = index.byId.get(cardId);
		if (!cc) continue;
		const primary =
			stacks.find((c) => c.isPrimary) ??
			stacks.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
		rows.push({
			card: hydrateCard(cc, setsById, i18n),
			stacks,
			primary,
			count: sumQuantity(stacks),
		});
	}
	return rows;
}

/**
 * Sort a CardRow array by the given key + direction.
 * Returns a new array (input is not mutated).
 * `price` sorts nulls last regardless of direction.
 */
export function sortCardRows(
	rows: CardRow[],
	key: SortKey,
	dir: SortDir,
): CardRow[] {
	const sign = dir === "asc" ? 1 : -1;
	const cmp = (a: CardRow, b: CardRow): number => {
		switch (key) {
			case "set": {
				if (a.card.setId !== b.card.setId)
					return a.card.setId.localeCompare(b.card.setId) * sign;
				return compareCardNumber(a.card.cardNumber, b.card.cardNumber) * sign;
			}
			case "year":
				return (
					(a.card.setReleaseDate ?? "").localeCompare(
						b.card.setReleaseDate ?? "",
					) * sign
				);
			case "acquired":
				return (a.primary.acquiredAt - b.primary.acquiredAt) * sign;
			case "price": {
				const pa = a.primary.pricePaid;
				const pb = b.primary.pricePaid;
				if (pa == null && pb == null) return 0;
				if (pa == null) return 1; // nulls always last
				if (pb == null) return -1;
				return (pa - pb) * sign;
			}
		}
	};
	return rows.toSorted(cmp);
}
