import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import { type CorpusIndex, hydrateCard } from "../corpus/corpus-engine";
import { compareCardNumber } from "../corpus/natural-compare";
import type { CollectionItem } from "./types";

export type SortKey = "set" | "acquired" | "price" | "year";
export type SortDir = "asc" | "desc";
export interface CardRow {
	card: HoloCardData;
	copies: CollectionItem[];
	primary: CollectionItem;
	count: number;
}

export function buildCardRows(
	items: CollectionItem[],
	index: CorpusIndex,
	setsById: Map<string, PokemonSet>,
): CardRow[] {
	const byCard = new Map<string, CollectionItem[]>();
	for (const it of items) {
		const arr = byCard.get(it.cardId);
		if (arr) arr.push(it);
		else byCard.set(it.cardId, [it]);
	}
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
