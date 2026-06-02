// src/store/userland/goal-progress.ts
import type { PokemonSet } from "../../server/card-mappers";
import type { CorpusIndex } from "../corpus/corpus-engine";
import type { Goal, GoalTarget } from "./types";

export interface TargetProgress {
	target: GoalTarget;
	label: string;
	owned: number;
	total: number;
}
export interface GoalProgress {
	targets: TargetProgress[];
	overall: { owned: number; total: number };
}

export function computeGoalProgress(
	goal: Goal,
	ownedCardIds: Set<string>,
	index: CorpusIndex,
	setsById: Map<string, PokemonSet>,
): GoalProgress {
	const seriesTotals = new Map<string, number>();
	const setIdsBySeries = new Map<string, Set<string>>();
	for (const s of setsById.values()) {
		seriesTotals.set(s.series, (seriesTotals.get(s.series) ?? 0) + s.total);
		let ids = setIdsBySeries.get(s.series);
		if (!ids) {
			ids = new Set();
			setIdsBySeries.set(s.series, ids);
		}
		ids.add(s.id);
	}
	const ownedBySet = new Map<string, number>();
	for (const id of ownedCardIds) {
		const setId = index.byId.get(id)?.setId;
		if (setId) ownedBySet.set(setId, (ownedBySet.get(setId) ?? 0) + 1);
	}
	const ownedInSeries = (series: string): number => {
		let n = 0;
		for (const setId of setIdsBySeries.get(series) ?? [])
			n += ownedBySet.get(setId) ?? 0;
		return n;
	};
	const targets: TargetProgress[] = goal.targets.map((t) => {
		if (t.kind === "set") {
			const set = setsById.get(t.setId);
			return {
				target: t,
				label: set?.name ?? t.setId,
				owned: ownedBySet.get(t.setId) ?? 0,
				total: set?.total ?? 0,
			};
		}
		if (t.kind === "series")
			return {
				target: t,
				label: t.series,
				owned: ownedInSeries(t.series),
				total: seriesTotals.get(t.series) ?? 0,
			};
		return {
			target: t,
			label: index.byId.get(t.cardId)?.name ?? t.cardId,
			owned: ownedCardIds.has(t.cardId) ? 1 : 0,
			total: 1,
		};
	});
	const coverSetIds = new Set<string>();
	const coverCardIds = new Set<string>();
	for (const t of goal.targets) {
		if (t.kind === "set") coverSetIds.add(t.setId);
		else if (t.kind === "series")
			for (const id of setIdsBySeries.get(t.series) ?? []) coverSetIds.add(id);
		else coverCardIds.add(t.cardId);
	}
	let total = 0;
	let owned = 0;
	const counted = new Set<string>();
	for (const c of index.cards) {
		if (coverSetIds.has(c.setId) && !counted.has(c.id)) {
			counted.add(c.id);
			total++;
			if (ownedCardIds.has(c.id)) owned++;
		}
	}
	for (const id of coverCardIds) {
		if (!counted.has(id)) {
			counted.add(id);
			total++;
			if (ownedCardIds.has(id)) owned++;
		}
	}
	return { targets, overall: { owned, total } };
}
