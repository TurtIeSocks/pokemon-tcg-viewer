// src/store/userland/sync/cache-repo.ts
//
// Per-user IDB cache UserlandRepos bundle with dirty tracking and soft-delete.
// Backed by `ptcg-cache-<uid>` idb-keyval stores (distinct uid → distinct
// stores). Standard port methods (add/bulkAdd/update/remove/removeMany) mark
// the affected row id dirty in a per-entity meta set.  remove/removeMany are
// soft-deletes (set deletedAt = Date.now(), mark dirty) rather than hard
// deletes. list() always filters out tombstoned rows.

import {
	clear,
	createStore,
	entries,
	get,
	set,
	setMany,
	type UseStore,
} from "idb-keyval";
import { DEFAULT_AVATAR_PRESET_ID } from "../../../components/profile/avatar-presets";
import type {
	BackupRepo,
	BindersRepo,
	CollectionRepo,
	ProfileRepo,
	UserlandRepos,
} from "../repo";
import type {
	Binder,
	NewBinder,
	NewStack,
	Profile,
	Stack,
	UserDataSnapshot,
} from "../types";
import { uuidv7 } from "../uuid";
import type { Entity } from "./types";

// ---------------------------------------------------------------------------
// Store factories (per-uid)
//
// Each factory uses a DISTINCT DB name (ptcg-cache-<uid>-<entity>) so that
// idb-keyval's createStore (which opens a DB with a single object store
// via onupgradeneeded) never tries to mix multiple stores in one DB.
// ---------------------------------------------------------------------------

function collectionStore(uid: string): UseStore {
	return createStore(`ptcg-cache-${uid}-items`, "items");
}

function bindersStore(uid: string): UseStore {
	return createStore(`ptcg-cache-${uid}-binders`, "binders");
}

function profileStore(uid: string): UseStore {
	return createStore(`ptcg-cache-${uid}-profile`, "profile");
}

function metaStore(uid: string): UseStore {
	return createStore(`ptcg-cache-${uid}-meta`, "meta");
}

// ---------------------------------------------------------------------------
// Dirty-set helpers (stored in the meta store as serialised arrays)
// ---------------------------------------------------------------------------

function dirtyKey(entity: Entity): string {
	return `dirty:${entity}`;
}

async function readDirtySet(
	meta: UseStore,
	entity: Entity,
): Promise<Set<string>> {
	const stored = await get<string[]>(dirtyKey(entity), meta);
	return new Set(stored ?? []);
}

async function writeDirtySet(
	meta: UseStore,
	entity: Entity,
	dirty: Set<string>,
): Promise<void> {
	await set(dirtyKey(entity), [...dirty], meta);
}

async function markDirty(
	meta: UseStore,
	entity: Entity,
	ids: string[],
): Promise<void> {
	const dirty = await readDirtySet(meta, entity);
	for (const id of ids) dirty.add(id);
	await writeDirtySet(meta, entity, dirty);
}

// ---------------------------------------------------------------------------
// Row fill helpers (mirrors idb-repo.ts patterns)
// ---------------------------------------------------------------------------

function fillStack(input: NewStack): Stack {
	const now = Date.now();
	return {
		id: uuidv7(),
		cardId: input.cardId,
		quantity: input.quantity ?? 1,
		createdAt: now,
		updatedAt: now,
		acquiredAt: input.acquiredAt ?? now,
		deletedAt: null,
		label: input.label ?? null,
		pricePaid: input.pricePaid ?? null,
		currency: input.currency ?? "USD",
		language: input.language ?? "en",
		variant: input.variant ?? null,
		printing: input.printing ?? null,
		notes: input.notes ?? null,
		condition: input.condition ?? null,
		grading: input.grading
			? { ...input.grading, cert: input.grading.cert ?? null }
			: null,
		source: input.source ?? null,
		storageLocation: input.storageLocation ?? null,
		isPrimary: input.isPrimary ?? false,
	};
}

function fillBinder(input: NewBinder): Binder {
	const now = Date.now();
	return {
		id: uuidv7(),
		name: input.name,
		description: input.description ?? null,
		rules: [],
		includeCardIds: [],
		excludeCardIds: [],
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	};
}

const LOCAL_PROFILE_ID = "me";

// ---------------------------------------------------------------------------
// Public helpers (not on the port — used by the sync engine)
// ---------------------------------------------------------------------------

/**
 * Return the current dirty-id set for an entity/uid.
 * The sync engine reads this before a push pass.
 */
export async function dirtyIds(
	uid: string,
	entity: Entity,
): Promise<Set<string>> {
	return readDirtySet(metaStore(uid), entity);
}

/**
 * Remove `ids` from the dirty set for an entity/uid.
 * The sync engine calls this after a successful push for those ids.
 * Conditional-safe: only removes ids whose row was actually pushed; ids
 * that were subsequently re-dirtied (updated after push started) are left
 * in the set because the caller only passes what it successfully pushed.
 */
export async function clearDirty(
	uid: string,
	entity: Entity,
	ids: string[],
): Promise<void> {
	const meta = metaStore(uid);
	const dirty = await readDirtySet(meta, entity);
	for (const id of ids) dirty.delete(id);
	await writeDirtySet(meta, entity, dirty);
}

/**
 * Return ALL rows for an entity, including tombstones.
 * Used by the sync engine to build the full cache Map for reconciliation.
 */
export async function allRows(uid: string, entity: "stacks"): Promise<Stack[]>;
export async function allRows(
	uid: string,
	entity: "binders",
): Promise<Binder[]>;
export async function allRows(
	uid: string,
	entity: "profiles",
): Promise<Profile[]>;
export async function allRows(
	uid: string,
	entity: Entity,
): Promise<Stack[] | Binder[] | Profile[]> {
	switch (entity) {
		case "stacks": {
			const rows = await entries<string, Stack>(collectionStore(uid));
			return rows.map(([, v]) => v);
		}
		case "binders": {
			const rows = await entries<string, Binder>(bindersStore(uid));
			return rows.map(([, v]) => v);
		}
		case "profiles": {
			const row = await get<Profile>(LOCAL_PROFILE_ID, profileStore(uid));
			return row ? [row] : [];
		}
	}
}

// ---------------------------------------------------------------------------
// createCacheRepos(uid) — main export
// ---------------------------------------------------------------------------

/** Build a full UserlandRepos bundle backed by per-uid IDB stores. */
export function createCacheRepos(uid: string): UserlandRepos {
	const cStore = collectionStore(uid);
	const bStore = bindersStore(uid);
	const pStore = profileStore(uid);
	const mStore = metaStore(uid);

	const collection: CollectionRepo = {
		async list() {
			const rows = await entries<string, Stack>(cStore);
			return rows.map(([, v]) => v).filter((s) => s.deletedAt === null);
		},

		async add(input) {
			const item = fillStack(input);
			await set(item.id, item, cStore);
			await markDirty(mStore, "stacks", [item.id]);
			return item;
		},

		async bulkAdd(inputs) {
			const items = inputs.map(fillStack);
			await setMany(
				items.map((i) => [i.id, i] as [string, Stack]),
				cStore,
			);
			await markDirty(
				mStore,
				"stacks",
				items.map((i) => i.id),
			);
			return items;
		},

		async update(id, patch) {
			const existing = await get<Stack>(id, cStore);
			if (!existing) return;
			await set(id, { ...existing, ...patch, updatedAt: Date.now() }, cStore);
			await markDirty(mStore, "stacks", [id]);
		},

		async remove(id) {
			const existing = await get<Stack>(id, cStore);
			if (!existing) return;
			await set(
				id,
				{ ...existing, deletedAt: Date.now(), updatedAt: Date.now() },
				cStore,
			);
			await markDirty(mStore, "stacks", [id]);
		},

		async removeMany(ids) {
			const now = Date.now();
			const pairs: [string, Stack][] = [];
			for (const id of ids) {
				const existing = await get<Stack>(id, cStore);
				if (existing) {
					pairs.push([id, { ...existing, deletedAt: now, updatedAt: now }]);
				}
			}
			if (pairs.length) {
				await setMany(pairs, cStore);
				await markDirty(
					mStore,
					"stacks",
					pairs.map(([id]) => id),
				);
			}
		},

		async clear() {
			// Soft-delete all live rows so tombstones push to cloud.
			const rows = await entries<string, Stack>(cStore);
			const now = Date.now();
			const pairs: [string, Stack][] = rows
				.map(([k, v]) => v ?? { id: k })
				.filter((v): v is Stack => v.deletedAt === null)
				.map((v) => [v.id, { ...v, deletedAt: now, updatedAt: now }]);
			if (pairs.length > 0) {
				await setMany(pairs, cStore);
				await markDirty(
					mStore,
					"stacks",
					pairs.map(([id]) => id),
				);
			}
		},
	};

	const binders: BindersRepo = {
		async list() {
			const rows = await entries<string, Binder>(bStore);
			return rows.map(([, v]) => v).filter((b) => b.deletedAt === null);
		},

		async create(input) {
			const b = fillBinder(input);
			await set(b.id, b, bStore);
			await markDirty(mStore, "binders", [b.id]);
			return b;
		},

		async update(id, patch) {
			const existing = await get<Binder>(id, bStore);
			if (!existing) return;
			await set(id, { ...existing, ...patch, updatedAt: Date.now() }, bStore);
			await markDirty(mStore, "binders", [id]);
		},

		async remove(id) {
			const existing = await get<Binder>(id, bStore);
			if (!existing) return;
			await set(
				id,
				{ ...existing, deletedAt: Date.now(), updatedAt: Date.now() },
				bStore,
			);
			await markDirty(mStore, "binders", [id]);
		},

		async clear() {
			// Soft-delete all live binders so tombstones push to cloud.
			const rows = await entries<string, Binder>(bStore);
			const now = Date.now();
			const pairs: [string, Binder][] = rows
				.map(([k, v]) => v ?? { id: k })
				.filter((v): v is Binder => v.deletedAt === null)
				.map((v) => [v.id, { ...v, deletedAt: now, updatedAt: now }]);
			if (pairs.length > 0) {
				await setMany(pairs, bStore);
				await markDirty(
					mStore,
					"binders",
					pairs.map(([id]) => id),
				);
			}
		},
	};

	// Serialize saves: two overlapping read-merge-writes would read the same
	// `existing` and the later write would silently drop the earlier patch.
	let profileSaveQueue: Promise<unknown> = Promise.resolve();
	const profile: ProfileRepo = {
		async get() {
			return (await get<Profile>(LOCAL_PROFILE_ID, pStore)) ?? null;
		},

		save(patch) {
			const run = profileSaveQueue.then(async () => {
				const now = Date.now();
				const existing = await get<Profile>(LOCAL_PROFILE_ID, pStore);
				const next: Profile = existing
					? { ...existing, ...patch, updatedAt: now }
					: {
							id: LOCAL_PROFILE_ID,
							displayName: patch.displayName ?? "Collector",
							bio: patch.bio ?? null,
							avatarPreset: patch.avatarPreset ?? DEFAULT_AVATAR_PRESET_ID,
							favoriteSetId: patch.favoriteSetId ?? null,
							displayLanguage: patch.displayLanguage ?? "en",
							displayCurrency: patch.displayCurrency ?? "USD",
							hideValue: patch.hideValue ?? false,
							createdAt: now,
							updatedAt: now,
							deletedAt: null,
						};
				await set(LOCAL_PROFILE_ID, next, pStore);
				await markDirty(mStore, "profiles", [LOCAL_PROFILE_ID]);
				return next;
			});
			// A rejected save must not poison the queue for later saves; the
			// rejection still propagates to this call's caller via `run`.
			profileSaveQueue = run.catch(() => {});
			return run;
		},

		async clear() {
			await clear(pStore);
		},
	};

	const backup: BackupRepo = {
		async exportAll() {
			const [c, b, p] = await Promise.all([
				collection.list(),
				binders.list(),
				profile.get(),
			]);
			return {
				schemaVersion: 6 as const,
				exportedAt: Date.now(),
				collection: c,
				binders: b,
				profile: p,
			};
		},

		async importAll(snapshot: UserDataSnapshot, mode: "replace" | "merge") {
			if (mode === "replace") {
				// Soft-delete existing rows so tombstones are pushed to cloud.
				await collection.clear();
				await binders.clear();
				// Profile is always hard-replaced (it's a singleton, re-written below).
				await clear(pStore);
			}
			// Write snapshot rows.
			if (snapshot.collection.length > 0) {
				await setMany(
					snapshot.collection.map((i) => [i.id, i] as [string, Stack]),
					cStore,
				);
				await markDirty(
					mStore,
					"stacks",
					snapshot.collection.map((i) => i.id),
				);
			}
			if (snapshot.binders.length > 0) {
				await setMany(
					snapshot.binders.map((b) => [b.id, b] as [string, Binder]),
					bStore,
				);
				await markDirty(
					mStore,
					"binders",
					snapshot.binders.map((b) => b.id),
				);
			}
			if (snapshot.profile) {
				await set(LOCAL_PROFILE_ID, snapshot.profile, pStore);
				await markDirty(mStore, "profiles", [LOCAL_PROFILE_ID]);
			}
		},
	};

	return { collection, binders, backup, profile };
}
