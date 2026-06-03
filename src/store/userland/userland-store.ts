// src/store/userland/userland-store.ts
import { create } from "zustand";
import { getRepos } from "./idb-repo";
import type { UserlandRepos } from "./repo";
import type {
	Binder,
	BinderPatch,
	BinderRule,
	CollectionItem,
	CopyPatch,
	EditableCopyFields,
	NewBinder,
	SerializedQuery,
	UserDataSnapshot,
} from "./types";

/** Shape of the Zustand userland store slice. */
interface UserlandState {
	/** All owned copies, keyed by copy id. */
	items: Record<string, CollectionItem>;
	/** All user binders, keyed by binder id. */
	binders: Record<string, Binder>;
	/** True once the first load from the repo has completed. */
	hydrated: boolean;
	/** True while the initial load is in flight. */
	loading: boolean;
}

const initial: UserlandState = {
	items: {},
	binders: {},
	hydrated: false,
	loading: false,
};

/** Zustand store holding all user-owned copies and binders. Subscribe via selectors. */
export const useUserland = create<UserlandState>(() => ({ ...initial }));

// --- Repo wiring (the swap point; overridable in tests) ---
let repos: UserlandRepos | null = null;
/** Return the active repo bundle, lazily initialising the IDB default. */
export function activeRepos(): UserlandRepos {
	if (!repos) repos = getRepos();
	return repos;
}
/** Override the active repo bundle (pass null to reset to the IDB default). Used in tests. */
export function setUserlandRepos(r: UserlandRepos | null): void {
	repos = r;
}

// --- Hydration ---
/** Load all items and binders from the repo and index them by id. */
async function fetchAll(
	r: UserlandRepos,
): Promise<Pick<UserlandState, "items" | "binders">> {
	const [itemList, binderList] = await Promise.all([
		r.collection.list(),
		r.binders.list(),
	]);
	const items: Record<string, CollectionItem> = {};
	for (const it of itemList) items[it.id] = it;
	const binders: Record<string, Binder> = {};
	for (const b of binderList) binders[b.id] = b;
	return { items, binders };
}

let inFlight: Promise<void> | null = null;
/**
 * Hydrate the store from the repo. Idempotent — no-ops if already hydrated;
 * deduplicates concurrent calls by returning the same in-flight promise.
 */
export function loadUserland(): Promise<void> {
	if (useUserland.getState().hydrated) return Promise.resolve();
	if (inFlight) return inFlight;
	useUserland.setState({ loading: true });
	inFlight = (async () => {
		const { items, binders } = await fetchAll(activeRepos());
		useUserland.setState({ items, binders, hydrated: true, loading: false });
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
/** Persist a new copy for the given card and update the store. */
export async function addCopy(
	cardId: string,
	fields: Partial<EditableCopyFields> = {},
): Promise<CollectionItem> {
	// Auto-primary: first copy of this card becomes primary.
	const existingCount = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === cardId,
	).length;
	const isPrimary = existingCount === 0 ? true : undefined;
	const item = await activeRepos().collection.add({
		cardId,
		...fields,
		...(isPrimary !== undefined ? { isPrimary } : {}),
	});
	// If repo did not persist isPrimary (fillItem doesn't), patch it now.
	if (isPrimary && !item.isPrimary) {
		await activeRepos().collection.update(item.id, { isPrimary: true });
		const patched = { ...item, isPrimary: true };
		useUserland.setState((s) => ({
			items: { ...s.items, [patched.id]: patched },
		}));
		return patched;
	}
	useUserland.setState((s) => ({ items: { ...s.items, [item.id]: item } }));
	return item;
}

/** Persist a patch to an existing copy and update the store optimistically. */
export async function updateCopy(id: string, patch: CopyPatch): Promise<void> {
	await activeRepos().collection.update(id, patch);
	useUserland.setState((s) => {
		const existing = s.items[id];
		if (!existing) return s;
		return { items: { ...s.items, [id]: { ...existing, ...patch } } };
	});
}

/** Delete a single copy by id from the repo and the store. */
export async function removeCopy(id: string): Promise<void> {
	const state = useUserland.getState();
	const copy = state.items[id];
	await activeRepos().collection.remove(id);
	useUserland.setState((s) => {
		const items = { ...s.items };
		delete items[id];
		return { items };
	});
	// Promote-on-delete: if removed copy was primary, promote earliest-createdAt survivor.
	if (copy?.isPrimary) {
		const survivors = Object.values(useUserland.getState().items)
			.filter((i) => i.cardId === copy.cardId)
			.sort((a, b) => a.createdAt - b.createdAt);
		if (survivors.length > 0) {
			await setPrimaryCopy(copy.cardId, survivors[0].id);
		}
	}
}

/**
 * Toggle ownership of a card: if ≥1 copy exists, remove all of them;
 * if 0 copies, add one (auto-marked primary by addCopy).
 */
export async function toggleCardOwned(cardId: string): Promise<void> {
	const ids = Object.values(useUserland.getState().items)
		.filter((i) => i.cardId === cardId)
		.map((i) => i.id);
	if (ids.length > 0) {
		await activeRepos().collection.removeMany(ids);
		useUserland.setState((s) => {
			const items = { ...s.items };
			for (const id of ids) delete items[id];
			return { items };
		});
	} else {
		await addCopy(cardId);
	}
}

/** Delete every copy owned for a given cardId in one batched operation. */
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

/** Persist one copy per cardId in a single write; useful for bulk import flows. */
export async function bulkAddCopies(
	cardIds: string[],
	fields: Partial<EditableCopyFields> = {},
): Promise<void> {
	// Seed with already-owned cardIds; only the FIRST newly-added copy of each
	// previously-unowned cardId in this batch becomes primary.
	const existing = useUserland.getState().items;
	const grantedPrimary = new Set(Object.values(existing).map((i) => i.cardId));
	const created = await activeRepos().collection.bulkAdd(
		cardIds.map((cardId) => ({ cardId, ...fields })),
	);
	// Patch primary flag for the first newly-owned copy of each card.
	const patched = await Promise.all(
		created.map(async (item) => {
			if (!grantedPrimary.has(item.cardId)) {
				grantedPrimary.add(item.cardId);
				await activeRepos().collection.update(item.id, { isPrimary: true });
				return { ...item, isPrimary: true };
			}
			return item;
		}),
	);
	useUserland.setState((s) => {
		const items = { ...s.items };
		for (const it of patched) items[it.id] = it;
		return { items };
	});
}

/** Erase the entire collection from storage and the store. */
export async function clearCollection(): Promise<void> {
	await activeRepos().collection.clear();
	useUserland.setState({ items: {} });
}

/**
 * Mark `copyId` as the primary copy for `cardId`; clears isPrimary on all other
 * copies of that card atomically (parallel repo writes, then a single state update).
 */
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

// --- Binder actions ---
/** Persist a new binder and add it to the store. */
export async function createBinder(input: NewBinder): Promise<Binder> {
	const b = await activeRepos().binders.create(input);
	useUserland.setState((s) => ({ binders: { ...s.binders, [b.id]: b } }));
	return b;
}

/** Persist a patch to an existing binder; updates updatedAt in both storage and store. */
export async function updateBinder(
	id: string,
	patch: BinderPatch,
): Promise<void> {
	await activeRepos().binders.update(id, patch);
	useUserland.setState((s) => {
		const existing = s.binders[id];
		if (!existing) return s;
		return {
			binders: {
				...s.binders,
				[id]: { ...existing, ...patch, updatedAt: Date.now() },
			},
		};
	});
}

/** Delete a binder by id from storage and the store. */
export async function removeBinder(id: string): Promise<void> {
	await activeRepos().binders.remove(id);
	useUserland.setState((s) => {
		const binders = { ...s.binders };
		delete binders[id];
		return { binders };
	});
}

/** Union cardIds into includeCardIds; remove those ids from excludeCardIds. */
export async function addCardsToBinder(
	id: string,
	cardIds: string[],
): Promise<void> {
	const binder = useUserland.getState().binders[id];
	if (!binder) return;
	const newIncludes = Array.from(
		new Set([...binder.includeCardIds, ...cardIds]),
	);
	const newExcludes = binder.excludeCardIds.filter(
		(eid) => !cardIds.includes(eid),
	);
	await updateBinder(id, {
		includeCardIds: newIncludes,
		excludeCardIds: newExcludes,
	});
}

/** Push a new rule onto the binder's rules array. */
export async function addRuleToBinder(
	id: string,
	query: SerializedQuery,
): Promise<void> {
	const binder = useUserland.getState().binders[id];
	if (!binder) return;
	const rule: BinderRule = { id: crypto.randomUUID(), query };
	await updateBinder(id, { rules: [...binder.rules, rule] });
}

/** Remove a rule from the binder by ruleId. */
export async function removeRuleFromBinder(
	id: string,
	ruleId: string,
): Promise<void> {
	const binder = useUserland.getState().binders[id];
	if (!binder) return;
	await updateBinder(id, {
		rules: binder.rules.filter((r) => r.id !== ruleId),
	});
}

/**
 * Remove cardId from includeCardIds and add to excludeCardIds.
 * Hides the card whether it came from a rule or a manual include. Idempotent.
 */
export async function removeCardFromBinder(
	id: string,
	cardId: string,
): Promise<void> {
	const binder = useUserland.getState().binders[id];
	if (!binder) return;
	const newIncludes = binder.includeCardIds.filter((cid) => cid !== cardId);
	// Always build a fresh array so the patch never shares a reference with prior state.
	const newExcludes = binder.excludeCardIds.includes(cardId)
		? [...binder.excludeCardIds]
		: [...binder.excludeCardIds, cardId];
	await updateBinder(id, {
		includeCardIds: newIncludes,
		excludeCardIds: newExcludes,
	});
}

/** Remove cardId from excludeCardIds (restores card visibility). */
export async function restoreCardToBinder(
	id: string,
	cardId: string,
): Promise<void> {
	const binder = useUserland.getState().binders[id];
	if (!binder) return;
	await updateBinder(id, {
		excludeCardIds: binder.excludeCardIds.filter((eid) => eid !== cardId),
	});
}

// --- Import / export actions ---
/** Produce a full snapshot of collection + binders via the backup repo. */
export function exportUserData(): Promise<UserDataSnapshot> {
	return activeRepos().backup.exportAll();
}

/**
 * Write a snapshot to storage then force-refresh the store.
 * Bypasses the hydrated guard so the store reflects the import immediately.
 */
export async function importUserData(
	snapshot: UserDataSnapshot,
	mode: "replace" | "merge",
): Promise<void> {
	const r = activeRepos();
	await r.backup.importAll(snapshot, mode);
	const { items, binders } = await fetchAll(r); // force-refresh (loadUserland would no-op once hydrated)
	useUserland.setState({ items, binders, hydrated: true });
}
