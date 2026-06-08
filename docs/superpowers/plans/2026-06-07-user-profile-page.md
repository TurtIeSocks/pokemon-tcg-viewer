# User Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/profile` page (accessible from the sidebar footer) backed by a `ProfileRepo` port so an eventual Supabase adapter is a drop-in swap.

**Architecture:** Profile follows the collection/binders pattern exactly — a null-disciplined `Profile` record, a `ProfileRepo` port in `repo.ts` implemented by the IDB adapter, hydrated into the non-persisted `useUserland` cache via an `updateProfile` action, and carried in the `UserDataSnapshot` backup envelope (bumped to v3). The page reuses the Liquid-Glass primitives and a shared `useCollectionStats` hook extracted from the vault summary.

**Tech Stack:** TypeScript, React 19, Zustand, idb-keyval, TanStack Router/Start, TanStack Form + Zod, shadcn/ui, Bun test runner (fake-indexeddb + happy-dom).

**Spec:** `docs/superpowers/specs/2026-06-07-user-profile-page-design.md`

---

## File structure

**New files**
- `src/components/profile/avatar-presets.ts` — `AVATAR_PRESETS`, `getAvatarPreset`, `initialsFrom` (pure).
- `src/components/profile/avatar-presets.test.ts`
- `src/components/profile/collector-avatar.tsx` — `<CollectorAvatar>` (gradient + initials).
- `src/components/profile/collector-avatar.test.tsx`
- `src/components/profile/profile-form-dialog.tsx` — edit dialog (TanStack Form + Zod).
- `src/components/profile/profile-form-dialog.test.tsx`
- `src/store/userland/stats.ts` — `earliestAcquired` + `useCollectionStats`.
- `src/store/userland/stats.test.ts`
- `src/routes/profile.tsx` — the `/profile` route + page.
- `src/routes/profile.test.tsx`

**Modified files**
- `src/store/userland/types.ts` — add `Profile`, `ProfilePatch`; bump `UserDataSnapshot` to v3.
- `src/store/userland/repo.ts` — add `ProfileRepo`; add `profile` to `UserlandRepos`.
- `src/store/userland/idb-repo.ts` — profile store + adapter; wire into `createIdbRepos`; backup v3.
- `src/store/userland/userland-store.ts` — `profile` state, hydration, `updateProfile`.
- `src/store/userland/backup.ts` — accept/upgrade v3.
- `src/components/vault/vault-summary.tsx` — consume `useCollectionStats` (DRY refactor).
- `src/components/shell/app-sidebar.tsx` — footer → `<Link to="/profile">` + avatar + name.
- `src/test-utils.tsx` — `makeSnapshot` → v3; add `makeProfile`; `setupUserlandTest` clears profile.
- Test edits for the v3 bump: `backup.test.ts`, `idb-repo.test.ts`, `vault-backup-controls.test.tsx`.

**Commands** (from worktree root)
- Test one file: `bun test src/path/to/file.test.ts`
- Typecheck: `bunx tsc -b`
- Lint: `bunx biome check --write --config-path=. <files>`

---

## Task 1: Avatar presets + initials (pure helpers)

**Files:**
- Create: `src/components/profile/avatar-presets.ts`
- Test: `src/components/profile/avatar-presets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/profile/avatar-presets.test.ts
import { expect, test } from "bun:test";
import {
	AVATAR_PRESETS,
	DEFAULT_AVATAR_PRESET_ID,
	getAvatarPreset,
	initialsFrom,
} from "./avatar-presets";

test("AVATAR_PRESETS is non-empty and every preset has id + gradient", () => {
	expect(AVATAR_PRESETS.length).toBeGreaterThan(0);
	for (const p of AVATAR_PRESETS) {
		expect(typeof p.id).toBe("string");
		expect(p.gradient).toContain("gradient");
	}
});

test("getAvatarPreset returns the match, or the default for unknown/empty", () => {
	const first = AVATAR_PRESETS[0];
	expect(getAvatarPreset(first.id).id).toBe(first.id);
	expect(getAvatarPreset("nope").id).toBe(DEFAULT_AVATAR_PRESET_ID);
	expect(getAvatarPreset("").id).toBe(DEFAULT_AVATAR_PRESET_ID);
});

test("initialsFrom derives 1-2 uppercase letters", () => {
	expect(initialsFrom("Ash Ketchum")).toBe("AK");
	expect(initialsFrom("misty")).toBe("M");
	expect(initialsFrom("  brock  stone ")).toBe("BS");
	expect(initialsFrom("")).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/profile/avatar-presets.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/components/profile/avatar-presets.ts

/** A named gradient option for the collector avatar (a tiny serialisable value, DB-ready). */
export interface AvatarPreset {
	id: string;
	name: string;
	/** A CSS background value (gradient). */
	gradient: string;
}

/** The default preset id; matches the legacy sidebar footer gradient. */
export const DEFAULT_AVATAR_PRESET_ID = "dusk";

/** Built-in avatar gradients in the violet/accent family. */
export const AVATAR_PRESETS: AvatarPreset[] = [
	{
		id: "dusk",
		name: "Dusk",
		gradient: "linear-gradient(135deg, oklch(0.5 0.12 290), oklch(0.4 0.1 320))",
	},
	{
		id: "violet",
		name: "Violet",
		gradient: "linear-gradient(135deg, oklch(0.7 0.19 295), oklch(0.5 0.16 290))",
	},
	{
		id: "ocean",
		name: "Ocean",
		gradient: "linear-gradient(135deg, oklch(0.62 0.13 230), oklch(0.45 0.12 260))",
	},
	{
		id: "ember",
		name: "Ember",
		gradient: "linear-gradient(135deg, oklch(0.68 0.17 35), oklch(0.5 0.16 12))",
	},
	{
		id: "meadow",
		name: "Meadow",
		gradient: "linear-gradient(135deg, oklch(0.7 0.15 150), oklch(0.5 0.13 175))",
	},
	{
		id: "gold",
		name: "Gold",
		gradient: "linear-gradient(135deg, oklch(0.78 0.13 85), oklch(0.6 0.12 60))",
	},
];

/** Look up a preset by id; falls back to the default for unknown/empty ids. */
export function getAvatarPreset(id: string): AvatarPreset {
	return (
		AVATAR_PRESETS.find((p) => p.id === id) ??
		AVATAR_PRESETS.find((p) => p.id === DEFAULT_AVATAR_PRESET_ID) ??
		AVATAR_PRESETS[0]
	);
}

/** First letters of the first and last word, uppercased (1-2 chars; "" when blank). */
export function initialsFrom(displayName: string): string {
	const words = displayName.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "";
	if (words.length === 1) return words[0][0].toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/profile/avatar-presets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/profile/avatar-presets.ts src/components/profile/avatar-presets.test.ts
git add src/components/profile/avatar-presets.ts src/components/profile/avatar-presets.test.ts
git commit -m "feat(profile): avatar presets + initials helpers"
```

---

## Task 2: Profile types + ProfileRepo port + IDB adapter

**Files:**
- Modify: `src/store/userland/types.ts` (add `Profile`, `ProfilePatch`)
- Modify: `src/store/userland/repo.ts` (add `ProfileRepo`; extend `UserlandRepos`)
- Modify: `src/store/userland/idb-repo.ts` (profile store + adapter; wire `createIdbRepos`)
- Test: `src/store/userland/idb-repo.test.ts` (append a profile section)

- [ ] **Step 1: Add the types** (`src/store/userland/types.ts`)

Add after the `Binder`/`BinderPatch` block (before `UserDataSnapshot`):

```ts
/** The local collector's profile. Singleton today; one row per auth user under a DB adapter. */
export interface Profile {
	id: string; // local: fixed "me"; DB: auth uid / PK
	displayName: string; // UI falls back to "Collector" when empty
	bio: string | null; // free text; null = unset
	avatarPreset: string; // key into AVATAR_PRESETS (gradient); never an uploaded image
	favoriteSetId: string | null; // corpus set id (FK); null = none picked
	createdAt: number; // ms epoch; set on first save
	updatedAt: number; // ms epoch; bumped each save
}

/** update() patch: omitted keys untouched; null clears nullable fields. */
export type ProfilePatch = Partial<
	Pick<Profile, "displayName" | "bio" | "avatarPreset" | "favoriteSetId">
>;
```

- [ ] **Step 2: Add the port** (`src/store/userland/repo.ts`)

Add `Profile, ProfilePatch` to the type import from `./types`, then add the interface and extend the bundle:

```ts
/** Persistence contract for the single local user profile. */
export interface ProfileRepo {
	/** Returns the stored profile, or null if never saved. */
	get(): Promise<Profile | null>;
	/** Upsert: first save fills id + createdAt; later saves merge the patch and bump updatedAt. */
	save(patch: ProfilePatch): Promise<Profile>;
	/** Delete the stored profile (used by backup replace + tests). */
	clear(): Promise<void>;
}
```

Then extend `UserlandRepos`:

```ts
export interface UserlandRepos {
	collection: CollectionRepo;
	binders: BindersRepo;
	backup: BackupRepo;
	profile: ProfileRepo;
}
```

- [ ] **Step 3: Write the failing adapter test** (append to `src/store/userland/idb-repo.test.ts`)

```ts
// --- Profile adapter ---
import { createIdbProfileRepo } from "./idb-repo";

/** A profile repo on a unique store so these tests are fully isolated. */
function freshProfileRepo() {
	return createIdbProfileRepo(
		createStore(`test-profile-${crypto.randomUUID()}`, "profile"),
	);
}

test("profile get() returns null when nothing saved", async () => {
	const repo = freshProfileRepo();
	expect(await repo.get()).toBeNull();
});

test("profile save() creates on first call then merges on the next", async () => {
	const repo = freshProfileRepo();
	const created = await repo.save({ displayName: "Ash" });
	expect(created.id).toBe("me");
	expect(created.displayName).toBe("Ash");
	expect(created.bio).toBeNull();
	expect(created.avatarPreset).toBe("dusk");
	expect(created.favoriteSetId).toBeNull();
	expect(typeof created.createdAt).toBe("number");

	const updated = await repo.save({ bio: "Gotta catch em all" });
	expect(updated.displayName).toBe("Ash"); // preserved
	expect(updated.bio).toBe("Gotta catch em all");
	expect(updated.createdAt).toBe(created.createdAt); // stable
	expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt); // bumped

	expect((await repo.get())?.bio).toBe("Gotta catch em all");
});

test("profile clear() removes the stored record", async () => {
	const repo = freshProfileRepo();
	await repo.save({ displayName: "Misty" });
	await repo.clear();
	expect(await repo.get()).toBeNull();
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: FAIL (`createIdbProfileRepo` not exported).

- [ ] **Step 5: Implement the adapter** (`src/store/userland/idb-repo.ts`)

Add `Profile, ProfilePatch, ProfileRepo` to the existing imports (`ProfileRepo` from `./repo`, types from `./types`), import the avatar default, and add the store + factory.

At the top, near the other `createStore` calls:

```ts
import { DEFAULT_AVATAR_PRESET_ID } from "../../components/profile/avatar-presets";
// ...
const profileStore = createStore("ptcg-profile", "profile");

/** Fixed key for the single local profile; maps to the auth uid under a DB adapter. */
export const LOCAL_PROFILE_ID = "me";
```

Add the factory (place it next to the other `createIdb*Repo` functions):

```ts
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
```

Wire it into `createIdbRepos`:

```ts
export function createIdbRepos(): UserlandRepos {
	const collection = createIdbCollectionRepo();
	const binders = createIdbBindersRepo();
	const profile = createIdbProfileRepo();
	const backup = createIdbBackupRepo(collection, binders);
	return { collection, binders, backup, profile };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: PASS (existing tests + 3 new profile tests).

- [ ] **Step 7: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/types.ts src/store/userland/repo.ts src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git add src/store/userland/types.ts src/store/userland/repo.ts src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git commit -m "feat(profile): ProfileRepo port + IndexedDB adapter"
```

---

## Task 3: Store — profile state, hydration, updateProfile

**Files:**
- Modify: `src/store/userland/userland-store.ts`
- Modify: `src/test-utils.tsx` (add `makeProfile`; clear profile in `setupUserlandTest`)
- Test: `src/store/userland/userland-store.test.ts` (append)

- [ ] **Step 1: Add `makeProfile` + clear profile in setup** (`src/test-utils.tsx`)

Add `Profile` to the type import from `./store/userland/types`, then add the fixture (next to `makeBinder`):

```ts
/** A profile fixture, every key present; override any field. */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
	const now = Date.now();
	return {
		id: "me",
		displayName: "Collector",
		bio: null,
		avatarPreset: "dusk",
		favoriteSetId: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}
```

In `setupUserlandTest`, add a profile clear alongside the others:

```ts
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	await repos.profile.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	return repos;
```

- [ ] **Step 2: Write the failing store test** (append to `src/store/userland/userland-store.test.ts`)

Add `updateProfile` to the imports from `./userland-store`, then:

```ts
// --- profile ---

test("profile starts null and hydrates from the repo", async () => {
	const repos = await setupUserlandTest();
	await repos.profile.save({ displayName: "Ash" });
	expect(useUserland.getState().profile).toBeNull();
	await loadUserland();
	expect(useUserland.getState().profile?.displayName).toBe("Ash");
});

test("updateProfile persists and commits the returned record", async () => {
	await setupUserlandTest();
	const saved = await updateProfile({ displayName: "Misty", bio: "Water" });
	expect(saved.displayName).toBe("Misty");
	expect(useUserland.getState().profile?.bio).toBe("Water");

	const merged = await updateProfile({ favoriteSetId: "base1" });
	expect(merged.displayName).toBe("Misty"); // preserved
	expect(useUserland.getState().profile?.favoriteSetId).toBe("base1");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: FAIL (`updateProfile` not exported; `profile` not on state).

- [ ] **Step 4: Implement store changes** (`src/store/userland/userland-store.ts`)

Add `Profile, ProfilePatch` to the type import. Then:

(a) Extend state + initial:

```ts
interface UserlandState {
	items: Record<string, Stack>;
	binders: Record<string, Binder>;
	/** The local user profile, or null until first saved. */
	profile: Profile | null;
	hydrated: boolean;
	loading: boolean;
}

const initial: UserlandState = {
	items: {},
	binders: {},
	profile: null,
	hydrated: false,
	loading: false,
};
```

(b) Extend `fetchAll` to also load the profile:

```ts
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
```

(c) Update `loadUserland`'s commit (the `setState` inside the IIFE) to spread the profile:

```ts
		const { items, binders, profile } = await fetchAll(activeRepos());
		useUserland.setState({
			items,
			binders,
			profile,
			hydrated: true,
			loading: false,
		});
```

(d) Update `importUserData`'s final refresh to include profile:

```ts
	const { items, binders, profile } = await fetchAll(r);
	useUserland.setState({ items, binders, profile, hydrated: true });
```

(e) Add the action (place near the binder actions, before Import/export):

```ts
// --- Profile actions ---
/** Persist a patch to the profile (upsert) and commit the returned record. */
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
	const profile = await activeRepos().profile.save(patch);
	useUserland.setState({ profile });
	return profile;
}
```

(`resetUserlandForTests` already does `useUserland.setState({ ...initial })`, which now resets `profile` to null — no change needed.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/store/userland/userland-store.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts src/test-utils.tsx
git add src/store/userland/userland-store.ts src/store/userland/userland-store.test.ts src/test-utils.tsx
git commit -m "feat(profile): hydrate profile + updateProfile action"
```

---

## Task 4: Backup snapshot → v3 (carry profile)

**Files:**
- Modify: `src/store/userland/types.ts` (`UserDataSnapshot` → v3)
- Modify: `src/store/userland/backup.ts` (support/upgrade v3)
- Modify: `src/store/userland/idb-repo.ts` (backup repo carries profile)
- Modify: `src/test-utils.tsx` (`makeSnapshot` → v3)
- Test edits: `src/store/userland/backup.test.ts`, `src/store/userland/idb-repo.test.ts`, `src/components/vault/vault-backup-controls.test.tsx`

> This change is a coupled type-literal bump: `UserDataSnapshot.schemaVersion` becomes the literal `3` with a required `profile` field, so every literal of that type must be updated together. Do it all in one task.

- [ ] **Step 1: Update the type** (`src/store/userland/types.ts`)

```ts
/** Import/export envelope. v3 added Profile; v2 added Stack.quantity + provenance; older backups upgrade on import. */
export interface UserDataSnapshot {
	schemaVersion: 3;
	exportedAt: number;
	collection: Stack[];
	binders: Binder[];
	profile: Profile | null;
}
```

- [ ] **Step 2: Update backup parse/upgrade** (`src/store/userland/backup.ts`)

(a) `SUPPORTED_VERSIONS`:

```ts
const SUPPORTED_VERSIONS = new Set([1, 2, 3]);
```

(b) `RawSnapshot` — add the optional field:

```ts
interface RawSnapshot {
	schemaVersion: number;
	exportedAt?: unknown;
	collection: Record<string, unknown>[];
	binders: Record<string, unknown>[];
	profile?: unknown;
}
```

(c) `upgrade()` — return v3 and pass a valid profile through (else null):

```ts
	const profile =
		isRecord(snap.profile) && typeof snap.profile.id === "string"
			? (snap.profile as unknown as UserDataSnapshot["profile"])
			: null;
	return {
		schemaVersion: 3,
		exportedAt: typeof snap.exportedAt === "number" ? snap.exportedAt : 0,
		collection,
		binders: snap.binders as unknown as UserDataSnapshot["binders"],
		profile,
	};
```

(d) Update the `isValidSnapshot` doc comment to say `{1,2,3}`.

- [ ] **Step 3: Update the IDB backup repo** (`src/store/userland/idb-repo.ts`)

The backup repo already uses module-level `collectionStore`/`bindersStore` directly. Do the same for the profile store, and take the profile repo for `exportAll`:

```ts
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
				schemaVersion: 3,
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
		},
	};
}
```

Update the `createIdbRepos` call to pass profile:

```ts
	const backup = createIdbBackupRepo(collection, binders, profile);
```

- [ ] **Step 4: Update `makeSnapshot`** (`src/test-utils.tsx`)

```ts
/** A v3 import/export envelope from the given stacks + binders (+ optional profile). */
export function makeSnapshot(
	collection: Stack[] = [],
	binders: Binder[] = [],
	profile: Profile | null = null,
): UserDataSnapshot {
	return {
		schemaVersion: 3,
		exportedAt: Date.now(),
		collection,
		binders,
		profile,
	};
}
```

- [ ] **Step 5: Update backup tests** (`src/store/userland/backup.test.ts`)

Make `good` a v3 snapshot by adding `profile: null` and `schemaVersion: 3`:

```ts
const good: UserDataSnapshot = {
	schemaVersion: 3,
	exportedAt: 0,
	collection: [ /* unchanged stack */ ],
	binders: [ /* unchanged binder */ ],
	profile: null,
};
```

Then change these specific assertions:

- "isValidSnapshot accepts a v2 snapshot" → keep; it already builds `good` — change it to `{ ...good, schemaVersion: 2 }` so it tests a v2 literal explicitly.
- "isValidSnapshot accepts both v1 and v2; rejects other versions" → rename to "...v1/v2/v3; rejects others" and update:

```ts
	expect(isValidSnapshot({ ...good, schemaVersion: 1 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 2 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 3 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 4 })).toBe(false);
```

- "parseSnapshot upgrades a v1 snapshot to v2 ..." → rename to "... to v3 ..." and change `expect(snap.schemaVersion).toBe(2)` to `toBe(3)`, then add `expect(snap.profile).toBeNull();`.

Add a new test for profile passthrough:

```ts
test("parseSnapshot keeps a valid profile on a v3 snapshot", () => {
	const withProfile = {
		...good,
		profile: {
			id: "me",
			displayName: "Ash",
			bio: null,
			avatarPreset: "dusk",
			favoriteSetId: null,
			createdAt: 1,
			updatedAt: 1,
		},
	};
	const snap = parseSnapshot(JSON.stringify(withProfile));
	expect(snap.profile?.displayName).toBe("Ash");
});
```

(`parseSnapshot returns the snapshot for valid JSON` now round-trips the v3 `good` unchanged — no edit needed.)

- [ ] **Step 6: Update idb-repo backup tests** (`src/store/userland/idb-repo.test.ts`)

- "exportAll returns a v2 snapshot of current data" → rename to "...v3..."; change `expect(snap.schemaVersion).toBe(2)` to `toBe(3)`; add `expect(snap.profile).toBeNull();`.
- The three inline `const snap: UserDataSnapshot = { schemaVersion: 2, ... }` literals (replace, merge, binder round-trip) → set `schemaVersion: 3` and add `profile: null,`.

Add a profile round-trip test in this section:

```ts
test("backup round-trips the profile via replace import", async () => {
	const snap: UserDataSnapshot = {
		schemaVersion: 3,
		exportedAt: 0,
		collection: [],
		binders: [],
		profile: {
			id: "me",
			displayName: "Ash",
			bio: "hi",
			avatarPreset: "violet",
			favoriteSetId: "base1",
			createdAt: 1,
			updatedAt: 2,
		},
	};
	await repos.backup.importAll(snap, "replace");
	const out = await repos.backup.exportAll();
	expect(out.profile?.displayName).toBe("Ash");
	expect(out.profile?.favoriteSetId).toBe("base1");
});
```

- [ ] **Step 7: Update the remaining schemaVersion assertion** (`src/components/vault/vault-backup-controls.test.tsx`)

Change `expect(snapshot.schemaVersion).toBe(2)` (in "exportUserData resolves a snapshot with correct shape") to `toBe(3)`.

- [ ] **Step 8: Run the touched tests + typecheck**

Run:
```bash
bun test src/store/userland/backup.test.ts src/store/userland/idb-repo.test.ts src/components/vault/vault-backup-controls.test.tsx
bunx tsc -b
```
Expected: all PASS; tsc clean. (`import-dialog.test.tsx` imports v2 files on purpose — still valid; leave it.)

- [ ] **Step 9: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/types.ts src/store/userland/backup.ts src/store/userland/backup.test.ts src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts src/test-utils.tsx src/components/vault/vault-backup-controls.test.tsx
git add -A
git commit -m "feat(profile): backup snapshot v3 carries the profile"
```

---

## Task 5: Shared collection stats hook

**Files:**
- Create: `src/store/userland/stats.ts`
- Test: `src/store/userland/stats.test.ts`
- Modify: `src/components/vault/vault-summary.tsx` (consume the hook; no behavior change)

- [ ] **Step 1: Write the failing pure-fn test** (`src/store/userland/stats.test.ts`)

```ts
// src/store/userland/stats.test.ts
import { expect, test } from "bun:test";
import { makeStack } from "../../test-utils";
import { earliestAcquired } from "./stats";

test("earliestAcquired returns null for an empty collection", () => {
	expect(earliestAcquired({})).toBeNull();
});

test("earliestAcquired returns the minimum acquiredAt", () => {
	const a = makeStack({ id: "a", acquiredAt: 300 });
	const b = makeStack({ id: "b", acquiredAt: 100 });
	const c = makeStack({ id: "c", acquiredAt: 200 });
	expect(earliestAcquired({ a, b, c })).toBe(100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/userland/stats.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook** (`src/store/userland/stats.ts`)

```ts
// src/store/userland/stats.ts
import { useMemo, useState } from "react";
import { setsById } from "../corpus/corpus-engine";
import { useStore } from "../index";
import { useOwnedCountBySet, useOwnedIndex } from "./selectors";
import type { Stack } from "./types";
import { useUserland } from "./userland-store";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Earliest stack acquisition time across the collection; null when empty. Pure. */
export function earliestAcquired(items: Record<string, Stack>): number | null {
	let min: number | null = null;
	for (const it of Object.values(items)) {
		if (min === null || it.acquiredAt < min) min = it.acquiredAt;
	}
	return min;
}

/** All headline collection stats in one read; reused by the vault hero + profile page. */
export interface CollectionStats {
	cardsOwned: number;
	setsTouched: number;
	completionPct: number;
	estValue: number | null;
	thisWeek: number;
	collectingSince: number | null;
}

/** Compute the headline collection stats reactively. */
export function useCollectionStats(): CollectionStats {
	const items = useUserland((s) => s.items);
	const ownedIndex = useOwnedIndex();
	const countBySet = useOwnedCountBySet();
	const sets = useStore((s) => s.sets);
	const [weekCutoff] = useState(() => Date.now() - WEEK_MS);

	return useMemo(() => {
		let owned = 0;
		let total = 0;
		if (sets) {
			const byId = setsById(sets);
			for (const [setId, count] of countBySet) {
				const set = byId.get(setId);
				if (!set || set.total <= 0) continue;
				owned += count;
				total += set.total;
			}
		}
		const completionPct =
			total === 0 ? 0 : Math.min(100, Math.round((owned / total) * 100));

		let sum = 0;
		let anyPrice = false;
		let thisWeek = 0;
		for (const it of Object.values(items)) {
			if (it.pricePaid !== null) {
				sum += it.pricePaid * it.quantity;
				anyPrice = true;
			}
			if (it.acquiredAt >= weekCutoff) thisWeek++;
		}

		return {
			cardsOwned: ownedIndex.size,
			setsTouched: countBySet.size,
			completionPct,
			estValue: anyPrice ? sum : null,
			thisWeek,
			collectingSince: earliestAcquired(items),
		};
	}, [items, ownedIndex, countBySet, sets, weekCutoff]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/userland/stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `vault-summary.tsx` to use the hook**

In `src/components/vault/vault-summary.tsx`:
- Delete the local `useCompletionPct`, `useEstValue`, `useThisWeekCount` functions and the `WEEK_MS` const.
- Remove now-unused imports (`useOwnedCountBySet`, `useOwnedIndex` from selectors; `setsById`; `useStore`) — keep `useState` only if still used (it is, for `importOpen`).
- Add `import { useCollectionStats } from "../../store/userland/stats";`.
- Keep `USD_FORMAT` + `formatDollars`.
- Replace the body of `VaultSummaryHero` stat reads:

```ts
export function VaultSummaryHero() {
	const [importOpen, setImportOpen] = useState(false);
	const { cardsOwned, setsTouched, completionPct, estValue, thisWeek } =
		useCollectionStats();
	const pct = completionPct;
	// ...rest of the JSX unchanged (uses cardsOwned, setsTouched, pct, estValue, thisWeek)
}
```

- [ ] **Step 6: Verify no regression**

Run:
```bash
bun test src/components/vault/
bunx tsc -b
```
Expected: PASS; tsc clean. (If a vault-summary render test exists it must still pass with identical numbers.)

- [ ] **Step 7: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/stats.ts src/store/userland/stats.test.ts src/components/vault/vault-summary.tsx
git add src/store/userland/stats.ts src/store/userland/stats.test.ts src/components/vault/vault-summary.tsx
git commit -m "refactor(vault): extract useCollectionStats; reuse in summary"
```

---

## Task 6: CollectorAvatar component

**Files:**
- Create: `src/components/profile/collector-avatar.tsx`
- Test: `src/components/profile/collector-avatar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/profile/collector-avatar.test.tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { CollectorAvatar } from "./collector-avatar";

test("renders initials derived from the display name", () => {
	render(<CollectorAvatar displayName="Ash Ketchum" preset="dusk" size={40} />);
	expect(screen.getByText("AK")).toBeDefined();
});

test("exposes the display name as an accessible label", () => {
	render(<CollectorAvatar displayName="Misty" preset="violet" size={28} />);
	expect(screen.getByLabelText("Misty")).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/profile/collector-avatar.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

```tsx
// src/components/profile/collector-avatar.tsx
import { cn } from "@/lib/utils";
import { getAvatarPreset, initialsFrom } from "./avatar-presets";

/** Props for {@link CollectorAvatar}. */
interface CollectorAvatarProps {
	/** Drives the initials + accessible label. */
	displayName: string;
	/** Avatar preset id; unknown ids fall back to the default gradient. */
	preset: string;
	/** Pixel diameter. */
	size: number;
	className?: string;
}

/** A round, gradient-filled avatar showing the collector's initials. */
export function CollectorAvatar({
	displayName,
	preset,
	size,
	className,
}: CollectorAvatarProps) {
	const { gradient } = getAvatarPreset(preset);
	const initials = initialsFrom(displayName);
	return (
		<div
			aria-label={displayName}
			className={cn(
				"flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white",
				className,
			)}
			style={{
				width: size,
				height: size,
				background: gradient,
				fontSize: Math.round(size * 0.4),
			}}
		>
			{initials}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/profile/collector-avatar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/profile/collector-avatar.tsx src/components/profile/collector-avatar.test.tsx
git add src/components/profile/collector-avatar.tsx src/components/profile/collector-avatar.test.tsx
git commit -m "feat(profile): CollectorAvatar component"
```

---

## Task 7: ProfileFormDialog

**Files:**
- Create: `src/components/profile/profile-form-dialog.tsx`
- Test: `src/components/profile/profile-form-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

> The repo has NO `@testing-library/user-event` dependency — tests drive forms with `fireEvent` (and `mock` from `bun:test`), submitting via `document.querySelector("form")`. Follow that house pattern; do not add user-event.

```tsx
// src/components/profile/profile-form-dialog.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useUserland } from "../../store/userland/userland-store";
import { setupUserlandTest } from "../../test-utils";
import { ProfileFormDialog } from "./profile-form-dialog";

beforeEach(async () => {
	await setupUserlandTest();
});

test("submitting persists the display name via updateProfile", async () => {
	render(<ProfileFormDialog open onOpenChange={() => {}} />);
	fireEvent.change(screen.getByLabelText(/display name/i), {
		target: { value: "Ash" },
	});
	// biome-ignore lint/style/noNonNullAssertion: form always present
	fireEvent.submit(document.querySelector("form")!);
	await waitFor(() => {
		expect(useUserland.getState().profile?.displayName).toBe("Ash");
	});
});

test("empty display name shows a required error", async () => {
	render(<ProfileFormDialog open onOpenChange={() => {}} />);
	const name = screen.getByLabelText(/display name/i);
	fireEvent.change(name, { target: { value: "" } });
	fireEvent.blur(name);
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	const err = await screen.findByRole("alert");
	expect(err.textContent).toBe("Display name is required");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/profile/profile-form-dialog.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the dialog**

```tsx
// src/components/profile/profile-form-dialog.tsx
"use client";

import { useForm } from "@tanstack/react-form";
import { useMemo } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fieldErrorText } from "@/lib/field-error";
import { useStore } from "../../store";
import type { Profile } from "../../store/userland/types";
import { updateProfile } from "../../store/userland/userland-store";
import {
	AVATAR_PRESETS,
	DEFAULT_AVATAR_PRESET_ID,
	getAvatarPreset,
} from "./avatar-presets";

const NONE = "__none__";

const profileFormSchema = z.object({
	displayName: z.string().min(1, "Display name is required"),
	bio: z.string(),
	avatarPreset: z.string(),
	favoriteSetId: z.string(),
});

/** Props for {@link ProfileFormDialog}. */
interface ProfileFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The current profile (null = first-time setup; fields seed from defaults). */
	profile?: Profile | null;
}

/** Dialog form for editing the collector profile (name, bio, avatar, favorite set). */
export function ProfileFormDialog({
	open,
	onOpenChange,
	profile,
}: ProfileFormDialogProps) {
	const sets = useStore((s) => s.sets);
	const setOptions = useMemo(
		() =>
			(sets ?? [])
				.map((s) => ({ id: s.id, name: s.name }))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[sets],
	);

	const form = useForm({
		defaultValues: {
			displayName: profile?.displayName ?? "",
			bio: profile?.bio ?? "",
			avatarPreset: profile?.avatarPreset ?? DEFAULT_AVATAR_PRESET_ID,
			favoriteSetId: profile?.favoriteSetId ?? NONE,
		},
		validators: { onSubmit: profileFormSchema },
		onSubmit: async ({ value }) => {
			await updateProfile({
				displayName: value.displayName,
				bio: value.bio.trim() ? value.bio : null,
				avatarPreset: value.avatarPreset,
				favoriteSetId: value.favoriteSetId === NONE ? null : value.favoriteSetId,
			});
			onOpenChange(false);
		},
	});

	return (
		<Dialog
			key={profile?.id ?? "new"}
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Edit profile</DialogTitle>
					<DialogDescription className="text-[var(--ink-muted)]">
						Your collector identity. Shown across the app.
					</DialogDescription>
				</DialogHeader>

				<form
					noValidate
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
					className="flex flex-col gap-4"
				>
					<FieldGroup>
						{/* Display name */}
						<form.Field
							name="displayName"
							validators={{ onBlur: profileFormSchema.shape.displayName }}
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor={field.name}>Display name</FieldLabel>
										<Input
											id={field.name}
											aria-invalid={isInvalid}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											placeholder="e.g. Ash Ketchum"
										/>
										{isInvalid && field.state.meta.errors.length > 0 && (
											<FieldError>
												{fieldErrorText(field.state.meta.errors[0])}
											</FieldError>
										)}
									</Field>
								);
							}}
						/>

						{/* Bio */}
						<form.Field
							name="bio"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Bio</FieldLabel>
									<Textarea
										id={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="A line about your collection"
										rows={3}
									/>
								</Field>
							)}
						/>

						{/* Avatar preset */}
						<form.Field
							name="avatarPreset"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel>Avatar</FieldLabel>
									<div className="flex flex-wrap gap-2">
										{AVATAR_PRESETS.map((p) => {
											const active = field.state.value === p.id;
											return (
												<button
													key={p.id}
													type="button"
													aria-label={p.name}
													aria-pressed={active}
													onClick={() => field.handleChange(p.id)}
													className={cn(
														"size-8 rounded-full ring-2 ring-offset-2 ring-offset-[var(--canvas)] transition-all",
														active
															? "ring-[var(--primary)]"
															: "ring-transparent hover:ring-white/30",
													)}
													style={{ background: getAvatarPreset(p.id).gradient }}
												/>
											);
										})}
									</div>
								</Field>
							)}
						/>

						{/* Favorite set */}
						<form.Field
							name="favoriteSetId"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Favorite set</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(v) => field.handleChange(v)}
									>
										<SelectTrigger id={field.name}>
											<SelectValue placeholder="None" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NONE}>None</SelectItem>
											{setOptions.map((s) => (
												<SelectItem key={s.id} value={s.id}>
													{s.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						/>
					</FieldGroup>

					<DialogFooter>
						<form.Subscribe
							selector={(s) => ({
								canSubmit: s.canSubmit,
								isSubmitting: s.isSubmitting,
							})}
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={({ canSubmit, isSubmitting }) => (
								<>
									<Button
										type="button"
										variant="ghost"
										onClick={() => onOpenChange(false)}
									>
										Cancel
									</Button>
									<Button type="submit" disabled={!canSubmit || isSubmitting}>
										{isSubmitting ? "Saving..." : "Save"}
									</Button>
								</>
							)}
						/>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/profile/profile-form-dialog.test.tsx`
Expected: PASS. If the shadcn `Select` (Radix) is hard to drive under happy-dom, the test only exercises the text input + submit, which is sufficient — do **not** add Select interaction to the test.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/profile/profile-form-dialog.tsx src/components/profile/profile-form-dialog.test.tsx
git add src/components/profile/profile-form-dialog.tsx src/components/profile/profile-form-dialog.test.tsx
git commit -m "feat(profile): ProfileFormDialog (name/bio/avatar/favorite set)"
```

---

## Task 8: Profile route + page

**Files:**
- Create: `src/routes/profile.tsx`
- Test: `src/routes/profile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/routes/profile.test.tsx
import { expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import {
	makeProfile,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../test-utils";
import type { NavTree } from "../lib/nav-tree";
import { ProfilePageInner } from "./profile";

const tree: NavTree = [
	{
		name: "Base",
		slug: "base",
		year: 1999,
		sets: [
			{
				id: "base1",
				name: "Base Set",
				slug: "base-set",
				logo: "l",
				symbol: "y",
				total: 102,
			},
		],
	},
];

test("renders the display name and the collector stats", async () => {
	const repos = await setupUserlandTest();
	await repos.profile.save({ displayName: "Ash Ketchum" });
	seedCorpus([]);
	await renderInRouter(<ProfilePageInner tree={tree} />);
	await waitFor(() => {
		expect(screen.getByText("Ash Ketchum")).toBeDefined();
	});
	expect(screen.getByText(/cards owned/i)).toBeDefined();
});

test("falls back to Collector when no profile is saved", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	await renderInRouter(<ProfilePageInner tree={tree} />);
	await waitFor(() => {
		expect(screen.getAllByText(/collector/i).length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/routes/profile.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the route + page**

```tsx
// src/routes/profile.tsx
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CollectorAvatar } from "@/components/profile/collector-avatar";
import { ProfileFormDialog } from "@/components/profile/profile-form-dialog";
import { SetTile } from "@/components/shell/set-tile";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { BezelPanel, GlassPanel } from "@/components/ui/glass";
import { Stagger } from "@/components/ui/motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import type { NavTree } from "../lib/nav-tree";
import { getNavTreeFn } from "../server/nav-tree";
import { useEnsureCorpus } from "../store/corpus/use-ensure-corpus";
import { useOwnedCountBySet } from "../store/userland/selectors";
import { useCollectionStats } from "../store/userland/stats";
import { useUserland } from "../store/userland/userland-store";

export const Route = createFileRoute("/profile")({
	loader: () => getNavTreeFn(),
	head: () => ({ meta: [{ title: "Your Profile — Pokémon TCG" }] }),
	component: ProfilePage,
});

const USD = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

/** Format a "collecting since" epoch as a year, or "—" when empty. */
function sinceYear(ms: number | null): string {
	return ms === null ? "—" : String(new Date(ms).getFullYear());
}

/** Exported for tests; pass tree directly to bypass Route.useLoaderData(). */
export function ProfilePageInner({ tree }: { tree: NavTree }) {
	useEnsureCorpus();
	const profile = useUserland((s) => s.profile);
	const stats = useCollectionStats();
	const countBySet = useOwnedCountBySet();
	const [editOpen, setEditOpen] = useState(false);

	const displayName = profile?.displayName || "Collector";
	const preset = profile?.avatarPreset ?? "dusk";

	const favorite =
		profile?.favoriteSetId != null
			? tree
					.flatMap((series) => series.sets.map((set) => ({ series, set })))
					.find(({ set }) => set.id === profile.favoriteSetId)
			: undefined;

	return (
		<Stagger className="space-y-0">
			{/* Hero */}
			<div className="space-y-1.5">
				<Eyebrow>Your profile</Eyebrow>
			</div>
			<BezelPanel className="mt-2">
				<div className="flex flex-wrap items-center gap-5">
					<CollectorAvatar displayName={displayName} preset={preset} size={72} />
					<div className="flex-1 space-y-1">
						<h1 className="font-display text-[clamp(1.6rem,3.5vw,2.25rem)] font-semibold leading-none tracking-tight text-[var(--ink)]">
							{displayName}
						</h1>
						<p className="text-[15px] text-[var(--ink-muted)]">
							{profile?.bio || "No bio yet."}
						</p>
					</div>
					<Button variant="soft" size="sm" onClick={() => setEditOpen(true)}>
						Edit profile
					</Button>
				</div>
			</BezelPanel>

			{/* Collector stats */}
			<section className="mt-8">
				<BezelPanel>
					<div className="flex flex-wrap items-center gap-7">
						<ProgressRing pct={stats.completionPct} size={88} stroke={8}>
							<div className="flex flex-col items-center leading-none">
								<span className="font-mono text-[21px] font-medium tabular-nums text-[var(--ink)]">
									{stats.completionPct}%
								</span>
								<span className="mt-0.5 text-[9.5px] uppercase tracking-[0.10em] text-[var(--faint)]">
									complete
								</span>
							</div>
						</ProgressRing>
						<div className="flex flex-1 flex-wrap gap-8">
							<Stat value={stats.cardsOwned.toLocaleString()} label="cards owned" />
							<Stat value={stats.setsTouched.toLocaleString()} label="sets touched" />
							{stats.estValue !== null && (
								<Stat value={USD.format(stats.estValue)} label="est. value" />
							)}
							<Stat value={sinceYear(stats.collectingSince)} label="collecting since" />
						</div>
					</div>
				</BezelPanel>
			</section>

			{/* Favorite set */}
			<section className="mt-8 space-y-3.5">
				<h2 className="font-display text-[21px] font-medium text-[var(--ink)]">
					Favorite set
				</h2>
				{favorite ? (
					<div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						<SetTile
							seriesSlug={favorite.series.slug}
							set={favorite.set}
							ownedCount={countBySet.get(favorite.set.id) ?? 0}
							vaultLink
						/>
					</div>
				) : (
					<GlassPanel className="py-10 text-center space-y-3">
						<p className="text-[var(--ink-muted)]">
							No favorite set yet — pick one to show it off.
						</p>
						<Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
							Choose favorite set
						</Button>
					</GlassPanel>
				)}
			</section>

			<ProfileFormDialog
				open={editOpen}
				onOpenChange={setEditOpen}
				profile={profile}
			/>
		</Stagger>
	);
}

function ProfilePageLoaded() {
	const tree = Route.useLoaderData();
	return <ProfilePageInner tree={tree} />;
}

function ProfilePage() {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-7xl px-4 py-5">
				<ClientOnly
					fallback={
						<div className="space-y-1.5">
							<Eyebrow>Your profile</Eyebrow>
							<h1 className="font-display text-3xl font-semibold text-[var(--ink)]">
								Collector
							</h1>
						</div>
					}
				>
					<ProfilePageLoaded />
				</ClientOnly>
			</div>
		</div>
	);
}
```

> Note: `SetTile`'s exact props must match the existing component — open `src/components/shell/set-tile.tsx` and confirm the prop names (`seriesSlug`, `set`, `ownedCount`, `vaultLink`) are correct as used in `vault/index.tsx`. Adjust if they differ.

- [ ] **Step 4: Regenerate the route tree, then run the test**

`routeTree.gen.ts` is gitignored and regenerated by the dev server. Boot it briefly so the new `/profile` route is registered (needed for `tsc` and for `<Link to="/profile">` in the next task):

```bash
# Start dev server in the background to regenerate routeTree.gen.ts, then it can be stopped.
```
Use the preview tooling (`preview_start`) or `bun run dev` in the background; once `src/routeTree.gen.ts` contains `/profile`, proceed.

Run: `bun test src/routes/profile.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + lint + commit**

```bash
bunx tsc -b
bunx biome check --write --config-path=. src/routes/profile.tsx src/routes/profile.test.tsx
git add src/routes/profile.tsx src/routes/profile.test.tsx
git commit -m "feat(profile): /profile route + page"
```

---

## Task 9: Sidebar footer → profile link

**Files:**
- Modify: `src/components/shell/app-sidebar.tsx` (footer)
- Test: `src/components/shell/app-sidebar.test.tsx` (append)

- [ ] **Step 1: Write the failing test** (append to `src/components/shell/app-sidebar.test.tsx`)

```tsx
test("footer links to the profile page", async () => {
	await renderSidebar();
	const profileLink = screen.getByRole("link", { name: /collector/i });
	expect((profileLink as HTMLAnchorElement).getAttribute("href")).toBe(
		"/profile",
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/shell/app-sidebar.test.tsx`
Expected: FAIL (no link named "Collector" yet; current footer is a plain `<span>`).

- [ ] **Step 3: Update the footer** (`src/components/shell/app-sidebar.tsx`)

Add imports near the top:

```ts
import { CollectorAvatar } from "@/components/profile/collector-avatar";
import { useUserland } from "../../store/userland/userland-store";
```

Replace the avatar `<div>` + "Collector" `<span>` (the current `SidebarFooter` identity block) with a profile link. Read the profile from the store; SSR renders the default and the store hydrates client-side (the label is identical — "Collector" — so no hydration mismatch for the text; the avatar uses the default preset until hydrated):

```tsx
<SidebarFooter>
	<div className="flex items-center gap-2 px-1 py-0.5">
		<FooterIdentity />
		{/* Icon buttons */}
		<div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
			<AboutDialog />
			<RepoLink />
		</div>
	</div>
</SidebarFooter>
```

Add the `FooterIdentity` component (place it above `AppSidebar`):

```tsx
/** Sidebar footer identity: avatar + name, linking to the profile page. */
function FooterIdentity() {
	const profile = useUserland((s) => s.profile);
	const { setOpenMobile } = useSidebar();
	const displayName = profile?.displayName || "Collector";
	const preset = profile?.avatarPreset ?? "dusk";
	return (
		<Link
			to="/profile"
			onClick={() => setOpenMobile(false)}
			className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 transition-colors hover:text-[var(--ink)]"
		>
			<CollectorAvatar displayName={displayName} preset={preset} size={28} />
			<span className="flex-1 truncate text-xs text-[var(--ink-muted)] group-data-[collapsible=icon]:hidden">
				{displayName}
			</span>
		</Link>
	);
}
```

- [ ] **Step 4: Run the sidebar test**

Run: `bun test src/components/shell/app-sidebar.test.tsx`
Expected: PASS (existing + 1 new). The "About and RepoLink are present" test still passes.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
bunx tsc -b
bunx biome check --write --config-path=. src/components/shell/app-sidebar.tsx src/components/shell/app-sidebar.test.tsx
git add src/components/shell/app-sidebar.tsx src/components/shell/app-sidebar.test.tsx
git commit -m "feat(profile): sidebar footer links to /profile"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck + lint in parallel**

Run (single batch):
```bash
bun test
bunx tsc -b
bunx biome check --config-path=. src/
```
Expected: all green. Fix any failures before proceeding.

- [ ] **Step 2: Browser smoke test**

Start the dev server (`preview_start` / `bun run dev`, port 6201). Then:
- Navigate to `/profile` — hero (avatar + "Collector"), stats strip, favorite-set empty state render.
- Click **Edit profile** → set a display name, a bio, an avatar swatch, a favorite set → **Save**.
- Confirm the hero + sidebar footer update (name + avatar), and the favorite-set tile appears.
- Reload — values persist (IndexedDB).
- Check the console for errors via `preview_console_logs`.
- Capture a screenshot of `/profile` for the user.

- [ ] **Step 3: Confirm no stray issues**

Run: `git status` — only intended files changed; no committed `routeTree.gen.ts` (it is gitignored).

---

## Self-review notes

- **Spec coverage:** data model (T2) · ProfileRepo + IDB (T2) · store hydration + updateProfile (T3) · backup v3 (T4) · shared stats / collecting-since (T5) · CollectorAvatar (T6) · edit dialog (T7) · /profile page + favorite set (T8) · sidebar footer link (T9) · tests throughout · final verify (T10). All spec sections mapped.
- **Type consistency:** `Profile`/`ProfilePatch` defined T2, used T2-T9; `LOCAL_PROFILE_ID = "me"` defined T2, asserted T2/T3; `useCollectionStats`/`CollectionStats` defined T5, used T8; `getAvatarPreset`/`initialsFrom`/`DEFAULT_AVATAR_PRESET_ID` defined T1, used T6/T7; `ProfileFormDialog` props (`open`/`onOpenChange`/`profile`) consistent T7↔T8; `CollectorAvatar` props (`displayName`/`preset`/`size`) consistent T6↔T8↔T9.
- **Ordering:** route file (T8) precedes the `<Link to="/profile">` (T9) so TanStack route typing resolves; routeTree regen called out in T8/T9.
- **Blast radius (v3 bump) enumerated in T4:** `backup.test.ts`, `idb-repo.test.ts`, `vault-backup-controls.test.tsx`, `test-utils.tsx`. `import-dialog.test.tsx` intentionally left on v2 (validates v2 import still works).
