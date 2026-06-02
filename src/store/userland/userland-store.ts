// src/store/userland/userland-store.ts
import { create } from "zustand";
import { getRepos } from "./idb-repo";
import type { UserlandRepos } from "./repo";
import type { CollectionItem, Goal } from "./types";

interface UserlandState {
	items: Record<string, CollectionItem>;
	goals: Record<string, Goal>;
	hydrated: boolean;
	loading: boolean;
}

const initial: UserlandState = {
	items: {},
	goals: {},
	hydrated: false,
	loading: false,
};

export const useUserland = create<UserlandState>(() => ({ ...initial }));

// --- Repo wiring (the swap point; overridable in tests) ---
let repos: UserlandRepos | null = null;
export function activeRepos(): UserlandRepos {
	if (!repos) repos = getRepos();
	return repos;
}
export function setUserlandRepos(r: UserlandRepos | null): void {
	repos = r;
}

// --- Hydration ---
async function fetchAll(
	r: UserlandRepos,
): Promise<Pick<UserlandState, "items" | "goals">> {
	const [itemList, goalList] = await Promise.all([
		r.collection.list(),
		r.goals.list(),
	]);
	const items: Record<string, CollectionItem> = {};
	for (const it of itemList) items[it.id] = it;
	const goals: Record<string, Goal> = {};
	for (const g of goalList) goals[g.id] = g;
	return { items, goals };
}

let inFlight: Promise<void> | null = null;
export function loadUserland(): Promise<void> {
	if (useUserland.getState().hydrated) return Promise.resolve();
	if (inFlight) return inFlight;
	useUserland.setState({ loading: true });
	inFlight = (async () => {
		const { items, goals } = await fetchAll(activeRepos());
		useUserland.setState({ items, goals, hydrated: true, loading: false });
	})().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

/** Test helper: clear the in-flight guard and reset state. */
export function resetUserlandForTests(): void {
	inFlight = null;
	useUserland.setState({ ...initial });
}
