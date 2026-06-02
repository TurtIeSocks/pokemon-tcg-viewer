import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import { type CorpusIndex, hydrateCard } from "../corpus/corpus-engine";
import { compareCardNumber } from "../corpus/natural-compare";
import { groupByCardId } from "./selectors";
import type { CollectionItem } from "./types";

/** Column the collection table is sorted by. */
export type SortKey = "set" | "acquired" | "price" | "year";
/** Sort direction for the collection table. */
export type SortDir = "asc" | "desc";
/** One row in the collection table: the display card, all copies, and the representative copy used for sorting. */
export interface CardRow {
	/** Corpus card data for display (image, name, set info). */
	card: HoloCardData;
	/** Every owned copy for this card. */
	copies: CollectionItem[];
	/**
	 * The copy used for sort keys (acquiredAt, pricePaid).
	 * isPrimary wins; otherwise the earliest createdAt copy.
	 */
	primary: CollectionItem;
	/** Number of owned copies (= copies.length). */
	count: number;
}

/**
 * Build one CardRow per distinct owned card.
 * Cards whose id is not found in the corpus index are silently dropped.
 */
export function buildCardRows(
	items: CollectionItem[],
	index: CorpusIndex,
	setsById: Map<string, PokemonSet>,
): CardRow[] {
	const byCard = groupByCardId(items);
	const rows: CardRow[] = [];
	for (const [cardId, copies] of byCard) {
		const cc = index.byId.get(cardId);
		if (!cc) continue;
		const primary =
			copies.find((c) => c.isPrimary) ??
			copies.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
		rows.push({
			card: hydrateCard(cc, setsById),
			copies,
			primary,
			count: copies.length,
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
	return [...rows].sort(cmp);
}
