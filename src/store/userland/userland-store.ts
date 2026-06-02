// src/store/userland/userland-store.ts
import { create } from "zustand";
import { getRepos } from "./idb-repo";
import type { UserlandRepos } from "./repo";
import type {
	CollectionItem,
	CopyPatch,
	EditableCopyFields,
	Goal,
	GoalPatch,
	GoalTarget,
	NewGoal,
	UserDataSnapshot,
} from "./types";

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

// --- Collection actions ---
export async function addCopy(
	cardId: string,
	fields: Partial<EditableCopyFields> = {},
): Promise<CollectionItem> {
	const item = await activeRepos().collection.add({ cardId, ...fields });
	useUserland.setState((s) => ({ items: { ...s.items, [item.id]: item } }));
	return item;
}

export async function updateCopy(id: string, patch: CopyPatch): Promise<void> {
	await activeRepos().collection.update(id, patch);
	useUserland.setState((s) => {
		const existing = s.items[id];
		if (!existing) return s;
		return { items: { ...s.items, [id]: { ...existing, ...patch } } };
	});
}

export async function removeCopy(id: string): Promise<void> {
	await activeRepos().collection.remove(id);
	useUserland.setState((s) => {
		const items = { ...s.items };
		delete items[id];
		return { items };
	});
}

export async function removeAllCopiesOfCard(cardId: string): Promise<void> {
	const ids = Object.values(useUserland.getState().items)
		.filter((i) => i.cardId === cardId)
		.map((i) => i.id);
	if (ids.length === 0) return;
	await activeRepos().collection.removeMany(ids);
	useUserland.setState((s) => {
		const items = { ...s.items };
		for (const id of ids) delete items[id];
		return { items };
	});
}

export async function bulkAddCopies(
	cardIds: string[],
	fields: Partial<EditableCopyFields> = {},
): Promise<void> {
	const created = await activeRepos().collection.bulkAdd(
		cardIds.map((cardId) => ({ cardId, ...fields })),
	);
	useUserland.setState((s) => {
		const items = { ...s.items };
		for (const it of created) items[it.id] = it;
		return { items };
	});
}

export async function clearCollection(): Promise<void> {
	await activeRepos().collection.clear();
	useUserland.setState({ items: {} });
}

export async function setPrimaryCopy(
	cardId: string,
	copyId: string,
): Promise<void> {
	const copies = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === cardId,
	);
	await Promise.all(
		copies.map((c) =>
			activeRepos().collection.update(c.id, { isPrimary: c.id === copyId }),
		),
	);
	useUserland.setState((s) => {
		const items = { ...s.items };
		// Re-derive from fresh state (not the pre-await `copies` snapshot) so a
		// concurrent add/delete can't resurrect a removed copy as a bogus entry.
		for (const it of Object.values(items)) {
			if (it.cardId === cardId)
				items[it.id] = { ...it, isPrimary: it.id === copyId };
		}
		return { items };
	});
}

// --- Goal actions ---
function sameTarget(a: GoalTarget, b: GoalTarget): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === "set" && b.kind === "set") return a.setId === b.setId;
	if (a.kind === "series" && b.kind === "series") return a.series === b.series;
	if (a.kind === "card" && b.kind === "card") return a.cardId === b.cardId;
	return false;
}

function dedupeTargets(targets: GoalTarget[]): GoalTarget[] {
	const out: GoalTarget[] = [];
	for (const t of targets) if (!out.some((o) => sameTarget(o, t))) out.push(t);
	return out;
}

export async function createGoal(input: NewGoal): Promise<Goal> {
	const g = await activeRepos().goals.create(input);
	useUserland.setState((s) => ({ goals: { ...s.goals, [g.id]: g } }));
	return g;
}

export async function updateGoal(id: string, patch: GoalPatch): Promise<void> {
	await activeRepos().goals.update(id, patch);
	useUserland.setState((s) => {
		const existing = s.goals[id];
		if (!existing) return s;
		return {
			goals: {
				...s.goals,
				[id]: { ...existing, ...patch, updatedAt: Date.now() },
			},
		};
	});
}

export async function removeGoal(id: string): Promise<void> {
	await activeRepos().goals.remove(id);
	useUserland.setState((s) => {
		const goals = { ...s.goals };
		delete goals[id];
		return { goals };
	});
}

export async function addGoalTargets(
	id: string,
	targets: GoalTarget[],
): Promise<void> {
	const g = useUserland.getState().goals[id];
	if (!g) return;
	await updateGoal(id, { targets: dedupeTargets([...g.targets, ...targets]) });
}

export async function removeGoalTarget(
	id: string,
	target: GoalTarget,
): Promise<void> {
	const g = useUserland.getState().goals[id];
	if (!g) return;
	await updateGoal(id, {
		targets: g.targets.filter((t) => !sameTarget(t, target)),
	});
}

// --- Import / export actions ---
export function exportUserData(): Promise<UserDataSnapshot> {
	return activeRepos().backup.exportAll();
}

export async function importUserData(
	snapshot: UserDataSnapshot,
	mode: "replace" | "merge",
): Promise<void> {
	const r = activeRepos();
	await r.backup.importAll(snapshot, mode);
	const { items, goals } = await fetchAll(r); // force-refresh (loadUserland would no-op once hydrated)
	useUserland.setState({ items, goals, hydrated: true });
}
