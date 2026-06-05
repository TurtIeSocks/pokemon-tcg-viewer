// src/store/userland/group.ts
// Pure stack-grouping helpers. Extracted from selectors.ts so card-rows.ts can
// use them without importing selectors (which imports card-rows) — breaking the
// card-rows ↔ selectors import cycle. selectors.ts re-exports both for back-compat.
import type { Stack } from "./types";

/** Group a flat list of stacks into a map keyed by cardId. */
export function groupByCardId(items: Stack[]): Map<string, Stack[]> {
	const map = new Map<string, Stack[]>();
	for (const item of items) {
		const arr = map.get(item.cardId);
		if (arr) arr.push(item);
		else map.set(item.cardId, [item]);
	}
	return map;
}

/** Total physical cards across stacks (sums quantity). */
export function sumQuantity(stacks: Stack[]): number {
	return stacks.reduce((n, s) => n + s.quantity, 0);
}
