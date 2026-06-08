// src/store/userland/idb-repo.ts
import {
	clear,
	createStore,
	del,
	delMany,
	entries,
	get,
	set,
	setMany,
	type UseStore,
} from "idb-keyval";
import { DEFAULT_AVATAR_PRESET_ID } from "../../components/profile/avatar-presets";
import type {
	BackupRepo,
	BindersRepo,
	CollectionRepo,
	ProfileRepo,
	UserlandRepos,
} from "./repo";
import type { Binder, NewBinder, NewStack, Profile, Stack } from "./types";

const collectionStore = createStore("ptcg-collection", "items");
const bindersStore = createStore("ptcg-binders", "binders");
const profileStore = createStore("ptcg-profile", "profile");

/** Fixed key for the single local profile; maps to the auth uid under a DB adapter. */
export const LOCAL_PROFILE_ID = "me";

/** Assign id, createdAt, and acquiredAt defaults; null-fill optional fields. */
function fillStack(input: NewStack): Stack {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		cardId: input.cardId,
		quantity: input.quantity ?? 1,
		createdAt: now,
		acquiredAt: input.acquiredAt ?? now,
		label: input.label ?? null,
		pricePaid: input.pricePaid ?? null,
		variant: input.variant ?? null,
		notes: input.notes ?? null,
		condition: input.condition ?? null,
		grading: input.grading ?? null,
		source: input.source ?? null,
		storageLocation: input.storageLocation ?? null,
	};
}

/**
 * Backfill fields absent on legacy (pre-Phase-0.1a) records read from storage.
 * Exported for direct unit testing. `quantity` defaults to 1; provenance to null.
 */
export function normalizeStack(raw: Stack): Stack {
	return {
		...raw,
		quantity:
			typeof raw.quantity === "number" && raw.quantity >= 1 ? raw.quantity : 1,
		source: raw.source ?? null,
		storageLocation: raw.storageLocation ?? null,
	};
}

/** Assign id, createdAt/updatedAt defaults, and fill optional fields. */
function fillBinder(input: NewBinder): Binder {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		name: input.name,
		description: input.description ?? null,
		rules: [],
		includeCardIds: [],
		excludeCardIds: [],
		createdAt: now,
		updatedAt: now,
	};
}

/** Create an IndexedDB-backed BindersRepo; uses the default binders store unless overridden (tests). */
export function createIdbBindersRepo(
	store: UseStore = bindersStore,
): BindersRepo {
	return {
		async list() {
			const rows = await entries<string, Binder>(store);
			return rows.map(([, v]) => v);
		},
		async create(input) {
			const b = fillBinder(input);
			await set(b.id, b, store);
			return b;
		},
		async update(id, patch) {
			const existing = await get<Binder>(id, store);
			if (!existing) return;
			await set(id, { ...existing, ...patch, updatedAt: Date.now() }, store);
		},
		async remove(id) {
			await del(id, store);
		},
		async clear() {
			await clear(store);
		},
	};
}

/** Create a BackupRepo that delegates to the provided collection + binders repos. */
function createIdbBackupRepo(
	collection: CollectionRepo,
	binders: BindersRepo,
): BackupRepo {
	return {
		async exportAll() {
			const [c, b] = await Promise.all([collection.list(), binders.list()]);
			return {
				schemaVersion: 2,
				exportedAt: Date.now(),
				collection: c,
				binders: b,
			};
		},
		async importAll(snapshot, mode) {
			if (mode === "replace") {
				await clear(collectionStore);
				await clear(bindersStore);
			}
			// Snapshot rows are full records — write verbatim to preserve ids.
			await setMany(
				snapshot.collection.map((i) => [i.id, i] as [string, Stack]),
				collectionStore,
			);
			await setMany(
				snapshot.binders.map((b) => [b.id, b] as [string, Binder]),
				bindersStore,
			);
		},
	};
}

/** Create an IndexedDB-backed ProfileRepo; uses the default profile store unless overridden (tests). */
export function createIdbProfileRepo(
	store: UseStore = profileStore,
): ProfileRepo {
	return {
		async get() {
			return (await get<Profile>(LOCAL_PROFILE_ID, store)) ?? null;
		},
		async save(patch) {
			const now = Date.now();
			const existing = await get<Profile>(LOCAL_PROFILE_ID, store);
			const next: Profile = existing
				? { ...existing, ...patch, updatedAt: now }
				: {
						id: LOCAL_PROFILE_ID,
						displayName: patch.displayName ?? "Collector",
						bio: patch.bio ?? null,
						avatarPreset: patch.avatarPreset ?? DEFAULT_AVATAR_PRESET_ID,
						favoriteSetId: patch.favoriteSetId ?? null,
						createdAt: now,
						updatedAt: now,
					};
			await set(LOCAL_PROFILE_ID, next, store);
			return next;
		},
		async clear() {
			await clear(store);
		},
	};
}

/** Wire all four IDB-backed repos into a UserlandRepos bundle. */
export function createIdbRepos(): UserlandRepos {
	const collection = createIdbCollectionRepo();
	const binders = createIdbBindersRepo();
	const profile = createIdbProfileRepo();
	const backup = createIdbBackupRepo(collection, binders);
	return { collection, binders, backup, profile };
}

// The ONE swap point. Today: IDB. Later: choose by auth/config.
let repos: UserlandRepos | null = null;
/** Lazily initialise and return the singleton IDB repo bundle. */
export function getRepos(): UserlandRepos {
	if (!repos) repos = createIdbRepos();
	return repos;
}

/** Create an IndexedDB-backed CollectionRepo; uses the default collection store unless overridden (tests). */
export function createIdbCollectionRepo(
	store: UseStore = collectionStore,
): CollectionRepo {
	return {
		async list() {
			const rows = await entries<string, Stack>(store);
			return rows.map(([, v]) => normalizeStack(v));
		},
		async add(input) {
			const item = fillStack(input);
			await set(item.id, item, store);
			return item;
		},
		async bulkAdd(inputs) {
			const items = inputs.map(fillStack);
			await setMany(
				items.map((i) => [i.id, i] as [string, Stack]),
				store,
			);
			return items;
		},
		async update(id, patch) {
			const existing = await get<Stack>(id, store);
			if (!existing) return;
			await set(id, { ...existing, ...patch }, store);
		},
		async remove(id) {
			await del(id, store);
		},
		async removeMany(ids) {
			await delMany(ids, store);
		},
		async clear() {
			await clear(store);
		},
	};
}
