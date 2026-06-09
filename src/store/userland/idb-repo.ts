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
import { uuidv7 } from "./uuid";

const collectionStore = createStore("ptcg-collection", "items");
const bindersStore = createStore("ptcg-binders", "binders");
const profileStore = createStore("ptcg-profile", "profile");
const metaStore = createStore("ptcg-meta", "meta");

/** Fixed key for the single local profile; maps to the auth uid under a DB adapter. */
export const LOCAL_PROFILE_ID = "me";

/** idb-keyval key (in the meta store) holding the migrated-to data version. */
const DATA_VERSION_KEY = "userlandDataVersion";
/** Bump when a NON-idempotent local-data migration is required (see `migrateUserlandData`). */
export const CURRENT_DATA_VERSION = 4;

/** Assign a v7 id + timestamps, default acquiredAt, and null-fill optional fields. */
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
		variant: input.variant ?? null,
		notes: input.notes ?? null,
		condition: input.condition ?? null,
		grading: input.grading ?? null,
		source: input.source ?? null,
		storageLocation: input.storageLocation ?? null,
		isPrimary: input.isPrimary ?? false,
	};
}

/**
 * Backfill fields absent on legacy records read from storage so every read
 * yields a complete current-shape Stack. MUST stay idempotent — it runs on
 * EVERY read, so it only fills absent values and never transforms a present
 * one. In particular it does NOT rescale `pricePaid`; the one-time dollars→cents
 * unit change lives in `migrateUserlandData`. Exported for direct unit testing.
 */
export function normalizeStack(raw: Stack): Stack {
	return {
		...raw,
		quantity:
			typeof raw.quantity === "number" && raw.quantity >= 1 ? raw.quantity : 1,
		updatedAt:
			typeof raw.updatedAt === "number" ? raw.updatedAt : raw.createdAt,
		deletedAt: raw.deletedAt ?? null,
		label: raw.label ?? null,
		currency: raw.currency ?? "USD",
		source: raw.source ?? null,
		storageLocation: raw.storageLocation ?? null,
		isPrimary: raw.isPrimary ?? false,
	};
}

/** Assign a v7 id, createdAt/updatedAt defaults, and fill optional fields. */
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

/** Create a BackupRepo that delegates to the provided collection + binders + profile repos. */
function createIdbBackupRepo(
	collection: CollectionRepo,
	binders: BindersRepo,
	profile: ProfileRepo,
): BackupRepo {
	return {
		async exportAll() {
			const [c, b, p] = await Promise.all([
				collection.list(),
				binders.list(),
				profile.get(),
			]);
			return {
				schemaVersion: 4,
				exportedAt: Date.now(),
				collection: c,
				binders: b,
				profile: p,
			};
		},
		async importAll(snapshot, mode) {
			if (mode === "replace") {
				await clear(collectionStore);
				await clear(bindersStore);
				await clear(profileStore);
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
			// Write the profile verbatim (preserve id/createdAt). A null profile in
			// merge mode must not wipe an existing one; replace already cleared it.
			if (snapshot.profile) {
				await set(LOCAL_PROFILE_ID, snapshot.profile, profileStore);
			}
			// parseSnapshot already upgraded these rows to the current version, so
			// stamp the marker. Without this, importing into a fresh install (marker
			// absent ⇒ 0) would let a later migrateUserlandData re-scale the
			// already-cents prices a second time.
			await set(DATA_VERSION_KEY, CURRENT_DATA_VERSION, metaStore);
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
						deletedAt: null,
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
	const backup = createIdbBackupRepo(collection, binders, profile);
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
			// Bump updatedAt on every edit — the last-write-wins key the sync adapter
			// will compare. Hard delete locally; the deletedAt tombstone is the sync
			// adapter's job (see migrateUserlandData / types.ts).
			await set(id, { ...existing, ...patch, updatedAt: Date.now() }, store);
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

/** The four idb-keyval stores `migrateUserlandData` touches (injectable for tests). */
interface MigrationStores {
	collection: UseStore;
	binders: UseStore;
	profile: UseStore;
	meta: UseStore;
}

/**
 * One-time, marker-gated migration of locally-stored userland data to
 * `CURRENT_DATA_VERSION`. Call once before the store first reads (loadUserland
 * does); a fresh install or an already-current store is a cheap no-op.
 *
 * This is the home for NON-idempotent transforms that `normalizeStack` (which
 * runs on every read) must never do. v3→v4 rescales `pricePaid` from whole
 * units (dollars — the pre-v4 storage unit) to minor units (cents).
 *
 * The version marker is claimed BEFORE the writes on purpose: if the process
 * dies mid-migration, the next run skips rather than re-entering. For a money
 * rescale that ordering matters — a re-entered pass would multiply already-cents
 * prices by 100 again (silent inflation). The downside (a crash leaves some rows
 * un-rescaled, reading 100× low) is visible and recoverable; the inverse is not.
 */
export async function migrateUserlandData(
	stores: MigrationStores = {
		collection: collectionStore,
		binders: bindersStore,
		profile: profileStore,
		meta: metaStore,
	},
): Promise<void> {
	const from = (await get<number>(DATA_VERSION_KEY, stores.meta)) ?? 0;
	if (from >= CURRENT_DATA_VERSION) return;
	await set(DATA_VERSION_KEY, CURRENT_DATA_VERSION, stores.meta);

	if (from < 4) {
		// pricePaid: dollars (whole units) → cents (minor units). Round to guard
		// against float drift (e.g. 3.5 → 350, not 349.99999). Also normalise the
		// new v4 fields so legacy rows match the current Stack shape.
		const items = await entries<string, Stack>(stores.collection);
		const migrated = items.map(
			([id, raw]) =>
				[
					id,
					{
						...normalizeStack(raw),
						pricePaid:
							raw.pricePaid == null ? null : Math.round(raw.pricePaid * 100),
					},
				] as [string, Stack],
		);
		if (migrated.length) await setMany(migrated, stores.collection);

		// Binders + profile only need the deletedAt tombstone backfilled (their
		// repos don't normalise on read the way the collection repo does).
		const binders = await entries<string, Binder>(stores.binders);
		const migratedBinders = binders.map(
			([id, b]) =>
				[id, { ...b, deletedAt: b.deletedAt ?? null }] as [string, Binder],
		);
		if (migratedBinders.length) await setMany(migratedBinders, stores.binders);

		const profile = await get<Profile>(LOCAL_PROFILE_ID, stores.profile);
		if (profile) {
			await set(
				LOCAL_PROFILE_ID,
				{ ...profile, deletedAt: profile.deletedAt ?? null },
				stores.profile,
			);
		}
	}
}
