// src/store/userland/userland-store.ts
import { create } from "zustand";
import { getBrowserClient, isCloudEnabled } from "../../lib/supabase/client";
import { getRepos, migrateUserlandData } from "./idb-repo";
import type { UserlandRepos } from "./repo";
import { createSupabaseRepo } from "./supabase-repo";
import type {
	Binder,
	BinderPatch,
	BinderRule,
	EditableStackFields,
	NewBinder,
	NewStack,
	Profile,
	ProfilePatch,
	SerializedQuery,
	Stack,
	StackPatch,
	UserDataSnapshot,
} from "./types";
import { uuidv7 } from "./uuid";

/** Shape of the Zustand userland store slice. */
interface UserlandState {
	/** All owned stacks, keyed by stack id. */
	items: Record<string, Stack>;
	/** All user binders, keyed by binder id. */
	binders: Record<string, Binder>;
	/** The local user profile, or null until first saved. */
	profile: Profile | null;
	/** True once the first load from the repo has completed. */
	hydrated: boolean;
	/** True while the initial load is in flight. */
	loading: boolean;
}

const initial: UserlandState = {
	items: {},
	binders: {},
	profile: null,
	hydrated: false,
	loading: false,
};

/** Zustand store holding all user-owned stacks and binders. Subscribe via selectors. */
export const useUserland = create<UserlandState>(() => ({ ...initial }));

// --- Repo wiring (the swap point; overridable in tests) ---
let repos: UserlandRepos | null = null;
/** True while a fake repo is injected — gates the real-IDB data migration off in tests. */
let usingInjectedRepos = false;

// --- Auth session tracking ---
// Synchronously tracks the current Supabase session so activeRepos() can decide
// which backend to return without needing to await anything.
type Session = { access_token: string } | null;
let currentSession: Session = null;
/** Lazily-created Supabase repo bundle (one per tab). */
let supabaseRepos: UserlandRepos | null = null;

/**
 * Wire up the Supabase auth listener. Must be called once at app init when
 * `isCloudEnabled()` is true (e.g. from the root component or client entry).
 *
 * On SIGNED_IN: updates session, runs the local→cloud claim for this uid, then
 * resets + re-hydrates useUserland from the now-active Supabase repos.
 * On SIGNED_OUT: resets session + re-hydrates from IDB.
 * On TOKEN_REFRESHED: just updates the session (no reload needed).
 */
export async function subscribeAuth(): Promise<void> {
	if (!isCloudEnabled()) return;
	const client = getBrowserClient();

	// Initial session check — synchronously initialise currentSession so that
	// activeRepos() returns the right bundle even before the first auth event fires.
	const {
		data: { session },
	} = await client.auth.getSession();
	currentSession = session;

	client.auth.onAuthStateChange((event, sess) => {
		currentSession = sess;

		if (event === "SIGNED_IN") {
			// Import lazily to avoid a circular dependency at module evaluation time.
			// claim.ts is authored after this file.
			void import("./claim").then(async ({ claimLocalToCloud }) => {
				const localRepos = getRepos();
				const cloudRepos = _getOrCreateSupabaseRepos();
				const uid = sess?.user.id ?? "";
				if (uid) await claimLocalToCloud(localRepos, cloudRepos, uid);
			});
			resetUserland();
			void loadUserland();
		} else if (event === "SIGNED_OUT") {
			supabaseRepos = null; // next SIGNED_IN gets a fresh bundle
			resetUserland();
			void loadUserland();
		}
		// TOKEN_REFRESHED: currentSession already updated above; no reload needed.
	});
}

/** Internal: lazily create + memoise the Supabase repo bundle. */
function _getOrCreateSupabaseRepos(): UserlandRepos {
	if (!supabaseRepos) supabaseRepos = createSupabaseRepo(getBrowserClient());
	return supabaseRepos;
}

/** Return the active repo bundle, lazily initialising the IDB default. */
export function activeRepos(): UserlandRepos {
	if (usingInjectedRepos && repos !== null) return repos;
	if (isCloudEnabled() && currentSession) return _getOrCreateSupabaseRepos();
	return getRepos();
}

/** Override the active repo bundle (pass null to reset to the IDB default). Used in tests. */
export function setUserlandRepos(r: UserlandRepos | null): void {
	repos = r;
	usingInjectedRepos = r !== null;
}

/**
 * Reset the in-memory Zustand state and the in-flight load guard so a subsequent
 * `loadUserland()` re-hydrates from scratch. Called on auth state changes and by
 * test helpers. Does NOT touch the repos pointer (use `setUserlandRepos` for that).
 */
function resetUserland(): void {
	inFlight = null;
	useUserland.setState({ ...initial });
}

// --- Hydration ---
/** Load all items, binders, and profile from the repo and index them by id. */
async function fetchAll(
	r: UserlandRepos,
): Promise<Pick<UserlandState, "items" | "binders" | "profile">> {
	const [itemList, binderList, profile] = await Promise.all([
		r.collection.list(),
		r.binders.list(),
		r.profile.get(),
	]);
	const items: Record<string, Stack> = {};
	for (const it of itemList) items[it.id] = it;
	const binders: Record<string, Binder> = {};
	for (const b of binderList) binders[b.id] = b;
	return { items, binders, profile };
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
		// Real IDB only: run the marker-gated one-time data migration before the
		// first read (dollars→cents, tombstone backfill). Skipped under an injected
		// fake repo — the migration targets the real idb-keyval stores directly, not
		// the repo abstraction. A migration failure must not block hydration.
		if (!usingInjectedRepos) {
			try {
				await migrateUserlandData();
			} catch (e) {
				console.error("Userland data migration failed; continuing", e);
			}
		}
		const { items, binders, profile } = await fetchAll(activeRepos());
		useUserland.setState({
			items,
			binders,
			profile,
			hydrated: true,
			loading: false,
		});
	})().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

/** Test helper: clear the in-flight guard, reset state, and clear any injected session. */
export function resetUserlandForTests(): void {
	inFlight = null;
	currentSession = null;
	supabaseRepos = null;
	useUserland.setState({ ...initial });
}

/**
 * Test-only: directly set the module-level session so `activeRepos()` sees it
 * without needing a real Supabase client. Pass `null` to simulate signed-out.
 */
export function _setCurrentSessionForTests(sess: Session): void {
	currentSession = sess;
}

// --- Collection actions ---
/** Persist a new stack for the given card and update the store. */
export async function addStack(
	cardId: string,
	fields: Partial<EditableStackFields> = {},
): Promise<Stack> {
	// Auto-primary: first stack of this card becomes primary. fillStack persists
	// isPrimary, so seed it at insert — no follow-up patch needed.
	const isPrimary = !Object.values(useUserland.getState().items).some(
		(i) => i.cardId === cardId,
	);
	const item = await activeRepos().collection.add({
		cardId,
		...fields,
		isPrimary,
	});
	useUserland.setState((s) => ({ items: { ...s.items, [item.id]: item } }));
	return item;
}

/** Persist a patch to an existing stack and update the store optimistically. */
export async function updateStack(
	id: string,
	patch: StackPatch,
): Promise<void> {
	await activeRepos().collection.update(id, patch);
	useUserland.setState((s) => {
		const existing = s.items[id];
		if (!existing) return s;
		// Mirror the repo's updatedAt bump so the optimistic copy matches.
		return {
			items: {
				...s.items,
				[id]: { ...existing, ...patch, updatedAt: Date.now() },
			},
		};
	});
}

/**
 * Split `count` cards off the stack `id` into a new sibling stack (same fields).
 * The original keeps `quantity - count`; the peeled stack is never primary.
 * Throws if `count` is not a whole number in [1, quantity - 1].
 */
export async function splitStack(id: string, count: number): Promise<string> {
	const src = useUserland.getState().items[id];
	if (!src) throw new Error("Stack not found");
	if (!Number.isInteger(count) || count < 1 || count >= src.quantity) {
		throw new Error(
			"Split count must be a whole number between 1 and quantity - 1",
		);
	}
	const { id: _id, createdAt: _c, isPrimary: _p, quantity: _q, ...rest } = src;
	const peeled = await activeRepos().collection.add({
		...rest,
		quantity: count,
	});
	await updateStack(id, { quantity: src.quantity - count });
	useUserland.setState((s) => ({
		items: { ...s.items, [peeled.id]: peeled },
	}));
	return peeled.id;
}

/** Delete a single stack by id from the repo and the store. */
export async function removeStack(id: string): Promise<void> {
	const state = useUserland.getState();
	const stack = state.items[id];
	await activeRepos().collection.remove(id);
	useUserland.setState((s) => {
		const items = { ...s.items };
		delete items[id];
		return { items };
	});
	// Promote-on-delete: if removed stack was primary, promote earliest-createdAt survivor.
	if (stack?.isPrimary) {
		const survivors = Object.values(useUserland.getState().items)
			.filter((i) => i.cardId === stack.cardId)
			.sort((a, b) => a.createdAt - b.createdAt);
		if (survivors.length > 0) {
			await setPrimaryStack(stack.cardId, survivors[0].id);
		}
	}
}

/** Stack ids currently owned for a cardId (across every stack of that card). */
function stackIdsOfCard(cardId: string): string[] {
	return Object.values(useUserland.getState().items)
		.filter((i) => i.cardId === cardId)
		.map((i) => i.id);
}

/** Drop the given stack ids from the in-memory store. */
function dropStacksFromState(ids: Iterable<string>): void {
	useUserland.setState((s) => {
		const items = { ...s.items };
		for (const id of ids) delete items[id];
		return { items };
	});
}

/** Remove the given stacks from the repo and the store (no-op for an empty list). */
async function removeStacksByIds(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await activeRepos().collection.removeMany(ids);
	dropStacksFromState(ids);
}

/**
 * Toggle ownership of a card: if ≥1 stack exists, remove all of them;
 * if 0 stacks, add one (auto-marked primary by addStack).
 */
export async function toggleCardOwned(cardId: string): Promise<void> {
	const ids = stackIdsOfCard(cardId);
	if (ids.length === 0) await addStack(cardId);
	else await removeStacksByIds(ids);
}

/** Delete every stack owned for a given cardId in one batched operation. */
export async function removeAllStacksOfCard(cardId: string): Promise<void> {
	await removeStacksByIds(stackIdsOfCard(cardId));
}

/**
 * Persist freshly-created stacks: mark the first newly-owned stack of each
 * previously-unowned card as primary (patching the repo), then merge all into
 * the store. `created` are the stacks just written via `collection.bulkAdd`;
 * the store is untouched by that write, so reading current ownership here still
 * reflects the pre-batch state.
 */
async function commitNewStacks(created: Stack[]): Promise<Stack[]> {
	const grantedPrimary = new Set(
		Object.values(useUserland.getState().items).map((i) => i.cardId),
	);
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
	return patched;
}

/** Persist one stack per cardId in a single write; useful for bulk import flows. */
export async function bulkAddStacks(
	cardIds: string[],
	fields: Partial<EditableStackFields> = {},
): Promise<void> {
	const created = await activeRepos().collection.bulkAdd(
		cardIds.map((cardId) => ({ cardId, ...fields })),
	);
	await commitNewStacks(created);
}

/** Persist many pre-built stacks in one write (CSV import); first stack of each previously-unowned card becomes primary. */
export async function addStacks(items: NewStack[]): Promise<Stack[]> {
	if (items.length === 0) return [];
	const created = await activeRepos().collection.bulkAdd(items);
	return commitNewStacks(created);
}

type DedupeFields = Pick<
	NewStack,
	| "cardId"
	| "language"
	| "variant"
	| "condition"
	| "grading"
	| "source"
	| "pricePaid"
	| "label"
>;
/** Identity key for "the same physical stack" (card + language + variant + condition + grading + source + price + label). */
export function stackIdentityKey(f: DedupeFields): string {
	return [
		f.cardId,
		f.language ?? "en",
		f.variant ?? "",
		f.condition ?? "",
		f.grading
			? `${f.grading.company}/${f.grading.grade}/${f.grading.cert ?? ""}`
			: "",
		f.source ?? "",
		f.pricePaid ?? "",
		f.label ?? "",
	].join("");
}

/** Commit imported stacks. merge=true sums quantity into an identical existing stack (and dedups the batch). */
export async function importStacks(
	items: NewStack[],
	merge: boolean,
): Promise<void> {
	if (!merge || items.length === 0) {
		await addStacks(items);
		return;
	}
	const existing = new Map<string, Stack>();
	for (const s of Object.values(useUserland.getState().items)) {
		existing.set(stackIdentityKey(s), s);
	}
	const bumps = new Map<string, number>(); // existing stack id → quantity to add
	const fresh = new Map<string, NewStack>(); // key → accumulated new stack
	for (const item of items) {
		const k = stackIdentityKey(item);
		const ex = existing.get(k);
		const q = item.quantity ?? 1;
		if (ex) {
			bumps.set(ex.id, (bumps.get(ex.id) ?? 0) + q);
		} else {
			const f = fresh.get(k);
			if (f) f.quantity = (f.quantity ?? 1) + q;
			else fresh.set(k, { ...item, quantity: q });
		}
	}
	for (const [id, add] of bumps) {
		const ex = useUserland.getState().items[id];
		if (ex) await updateStack(id, { quantity: ex.quantity + add });
	}
	await addStacks([...fresh.values()]);
}

/** Merge every group of identical stacks (same identity key) for a card into one, summing quantities. */
export async function mergeDuplicateStacks(cardId: string): Promise<void> {
	const stacks = Object.values(useUserland.getState().items).filter(
		(s) => s.cardId === cardId,
	);
	const groups = new Map<string, Stack[]>();
	for (const s of stacks) {
		const k = stackIdentityKey(s);
		const g = groups.get(k);
		if (g) g.push(s);
		else groups.set(k, [s]);
	}
	for (const group of groups.values()) {
		if (group.length < 2) continue;
		const keep = group.find((s) => s.isPrimary) ?? group[0];
		const total = group.reduce((n, s) => n + s.quantity, 0);
		const removeIds = group.filter((s) => s.id !== keep.id).map((s) => s.id);
		await updateStack(keep.id, { quantity: total });
		await activeRepos().collection.removeMany(removeIds);
		useUserland.setState((st) => {
			const items = { ...st.items };
			for (const id of removeIds) delete items[id];
			return { items };
		});
	}
}

/** Erase the entire collection from storage and the store. */
export async function clearCollection(): Promise<void> {
	await activeRepos().collection.clear();
	useUserland.setState({ items: {} });
}

/**
 * Mark `stackId` as the primary stack for `cardId`; clears isPrimary on all other
 * stacks of that card atomically (parallel repo writes, then a single state update).
 */
export async function setPrimaryStack(
	cardId: string,
	stackId: string,
): Promise<void> {
	const stacks = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === cardId,
	);
	await Promise.all(
		stacks.map((c) =>
			activeRepos().collection.update(c.id, { isPrimary: c.id === stackId }),
		),
	);
	useUserland.setState((s) => {
		const items = { ...s.items };
		// Re-derive from fresh state (not the pre-await `stacks` snapshot) so a
		// concurrent add/delete can't resurrect a removed stack as a bogus entry.
		for (const it of Object.values(items)) {
			if (it.cardId === cardId)
				items[it.id] = { ...it, isPrimary: it.id === stackId };
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
	const rule: BinderRule = { id: uuidv7(), query };
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

// --- Profile actions ---
/** Persist a patch to the profile (upsert) and commit the returned record. */
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
	const profile = await activeRepos().profile.save(patch);
	useUserland.setState({ profile });
	return profile;
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
	const { items, binders, profile } = await fetchAll(r); // force-refresh (loadUserland would no-op once hydrated)
	useUserland.setState({ items, binders, profile, hydrated: true });
}
