# User Profile Page — Design

**Date:** 2026-06-07
**Status:** Approved (delegate mode)

## Goal

Add a user profile page accessible from the sidebar footer (currently the static
"Collector" label + avatar). Like everything in userland, it must be **DB-ready**:
storage goes through a repository port so an eventual Supabase adapter is a drop-in
swap, not a rewrite.

## Architecture summary

Profile follows the exact pattern collection + binders use:

- A `Profile` record with strict null-discipline (optional fields are `null`, never `undefined`).
- A `ProfileRepo` port in `repo.ts`, implemented by the IndexedDB adapter in `idb-repo.ts`.
- Hydrated into the non-persisted `useUserland` Zustand cache; an `updateProfile` action awaits the repo then commits.
- Carried in the `UserDataSnapshot` backup envelope (bumped to v3) so export/restore is consistent with the rest of userland.

Singleton today (one local collector). Under a DB adapter it becomes one row per
authenticated user — the fixed local key maps to the auth uid.

## 1. Data model (`src/store/userland/types.ts`)

```ts
/** The local collector's profile. Singleton today; one row per auth user under a DB adapter. */
export interface Profile {
  id: string;                   // local: fixed "me"; DB: auth uid / PK
  displayName: string;          // shown in sidebar + page; UI falls back to "Collector" when empty
  bio: string | null;           // free text; null = unset
  avatarPreset: string;         // key into AVATAR_PRESETS (gradient); never an uploaded image
  favoriteSetId: string | null; // corpus set id (FK); null = none picked
  createdAt: number;            // ms epoch; set on first save
  updatedAt: number;            // ms epoch; bumped each save
}

/** update() patch: omitted keys untouched; null clears nullable fields. */
export type ProfilePatch = Partial<
  Pick<Profile, "displayName" | "bio" | "avatarPreset" | "favoriteSetId">
>;
```

Avatar is a **preset gradient key + initials derived from `displayName`** — not a
file upload (blob storage is heavy for local-first and a DB adapter; out of scope).

## 2. Repo port + IDB adapter

### `src/store/userland/repo.ts`

```ts
/** Persistence contract for the single local user profile. */
export interface ProfileRepo {
  /** Returns the stored profile, or null if never saved. */
  get(): Promise<Profile | null>;
  /** Upsert: first save fills id + createdAt; later saves merge the patch and bump updatedAt. */
  save(patch: ProfilePatch): Promise<Profile>;
}
```

`UserlandRepos` gains `profile: ProfileRepo`.

### `src/store/userland/idb-repo.ts`

- New store: `createStore("ptcg-profile", "profile")`.
- Fixed key constant `LOCAL_PROFILE_ID = "me"`.
- `createIdbProfileRepo(store?)`:
  - `get()` → `get(LOCAL_PROFILE_ID, store)` (returns `null`/`undefined` → `null`).
  - `save(patch)` → read existing; if absent, build a default record (`id: LOCAL_PROFILE_ID`,
    `createdAt/updatedAt = now`, `displayName: patch.displayName ?? "Collector"`, nullable
    fields `null`, `avatarPreset` default) merged with patch; if present, merge patch and
    bump `updatedAt`. Persist and return the full record.
- `createIdbRepos()` wires `profile` into the returned bundle.

DB-readiness: the fixed `"me"` key ↔ auth uid; `createdAt`/`updatedAt` columns; `favoriteSetId` FK.

## 3. Store integration (`src/store/userland/userland-store.ts`)

- `UserlandState` gains `profile: Profile | null` (initial `null`).
- `fetchAll` adds `r.profile.get()` to its `Promise.all`, returns `profile` alongside `items`/`binders`.
- `loadUserland` / `importUserData` commit `profile` into state.
- New action:

```ts
/** Persist a patch to the profile (upsert) and commit the returned record. */
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const profile = await activeRepos().profile.save(patch);
  useUserland.setState({ profile });
  return profile;
}
```

- `resetUserlandForTests` resets `profile` to `null`.
- **No auto-write on load** — the record is born on first edit. Until then the UI falls
  back to `displayName || "Collector"` and the default avatar preset.

## 4. Backup snapshot → v3

### `types.ts`

```ts
export interface UserDataSnapshot {
  schemaVersion: 3;
  exportedAt: number;
  collection: Stack[];
  binders: Binder[];
  profile: Profile | null;
}
```

### `backup.ts`

- `SUPPORTED_VERSIONS` adds `3`.
- `RawSnapshot` gains optional `profile`.
- `upgrade()` returns `schemaVersion: 3` and maps v1/v2 → `profile: null`; v3 passes
  the profile through (defensively null if malformed).

### `idb-repo.ts` backup adapter

- `exportAll()` includes `profile: await profileRepo.get()`.
- `importAll()`:
  - **replace** mode: clear the profile store, then write `snapshot.profile` if non-null
    (a null profile leaves the store empty).
  - **merge** mode: write `snapshot.profile` only if non-null (a profile-less backup must
    not wipe an existing profile).

## 5. Derived collection stats — shared hook (`src/store/userland/stats.ts`, new)

The stat math is currently trapped as non-exported hooks inside `vault-summary.tsx`.
Extract into a reusable hook so the profile page and the vault hero share one source:

```ts
/** Earliest stack acquisition time across the collection; null when empty. Pure, unit-tested. */
export function earliestAcquired(items: Record<string, Stack>): number | null;

/** All headline collection stats in one read. */
export function useCollectionStats(): {
  cardsOwned: number;       // distinct owned cards
  setsTouched: number;      // sets with >=1 owned card
  completionPct: number;    // 0..100 over touched sets
  estValue: number | null;  // sum(pricePaid * quantity); null if no priced stacks
  thisWeek: number;         // copies acquired in last 7 days
  collectingSince: number | null; // earliestAcquired(items)
};
```

Refactor `VaultSummaryHero` to consume `useCollectionStats` — pure DRY, no behavior change.

## 6. Routing + page (`src/routes/profile.tsx`)

Flat leaf route `/profile` (sibling of `search.tsx`), `ClientOnly`-wrapped (reads the
userland store + corpus). Layout:

- **Hero** (`BezelPanel`): large `CollectorAvatar` + `displayName` + `bio` + an **Edit profile** button. `Eyebrow` reads "Your profile".
- **Collector stats strip**: completion `ProgressRing` + `Stat`s (cards owned, sets touched, est. value, collecting since) from `useCollectionStats`.
- **Favorite set**: a `SetTile` when `favoriteSetId` is set; otherwise a soft "Pick a favorite set" prompt that opens the edit dialog.

Page exports `Route` + component (route `only-export-components` is expected/unavoidable
in TanStack Start).

## 7. Sidebar footer (`src/components/shell/app-sidebar.tsx`)

- Wrap the avatar + name in `<Link to="/profile">`.
- Render `<CollectorAvatar>` using the stored `avatarPreset`; show `profile.displayName`.
- SSR-safe fallback: render "Collector" + default preset on the server, override after mount
  (ClientOnly or a mounted guard) to avoid a hydration mismatch.
- Keep `AboutDialog` + `RepoLink`.

## 8. New components (`src/components/profile/`)

- **`avatar-presets.ts`** — `AVATAR_PRESETS`: ~6 named gradients. The current footer
  gradient becomes the default preset `"dusk"`. Plus a helper to read a preset by id with fallback.
- **`collector-avatar.tsx`** — `<CollectorAvatar preset displayName size>`: a rounded
  element painted with the preset gradient, showing initials derived from `displayName`.
  Reused in the footer, the page hero, and the dialog preview.
- **`profile-form-dialog.tsx`** — TanStack Form (render-prop) + Zod, mirroring
  `BinderFormDialog`. Fields: display name (required, min 1), bio (textarea), avatar preset
  picker (swatch buttons), favorite set (combobox over corpus sets, clearable). Empty strings
  map to `null` at the boundary. On submit calls `updateProfile`.

## 9. Testing (Bun runner, existing patterns)

- **IDB adapter** (`idb-repo.test.ts`): `get()` null when empty; `save()` creates then merges (upsert); `createdAt` stable across saves, `updatedAt` bumps.
- **Store** (`userland-store.test.ts`): `updateProfile` persists + commits; hydration loads profile via a fake repo.
- **Backup** (`backup.test.ts`): v3 round-trips profile; v1/v2 upgrade → `profile: null`; malformed profile → null.
- **Stats** (`stats.test.ts`, new): `earliestAcquired` (empty → null, picks min).
- **Page** (`profile.test.tsx`, new): light render — pre-seed corpus
  (`useCorpusRuntime.setState({ index: buildIndex([...]) })`) + fake repo; asserts name/stats render.
- Existing tests that construct a fake `UserlandRepos` gain a `profile` stub (add a small shared fake-profile-repo helper to avoid repetition).

## Decisions (judgement calls made in delegate mode)

1. **Route is top-level `/profile`** (not `/vault/profile`) — the footer avatar is global chrome.
2. **Fields:** displayName, bio, avatarPreset, favoriteSetId only. Cut: location, handle/username, social links.
3. **Avatar** is a preset gradient + initials; no image upload.
4. **Backup bumped to v3** to carry profile (export consistency).
5. **`favoriteSetId` included** as the page's one expressive touch (showcases the corpus join).
6. **Stats extracted** to a shared `useCollectionStats` hook (refactors `vault-summary.tsx`).
7. **"Collecting since"** derived from earliest stack, not a profile field.
8. **Edit via dialog**, consistent with binders.

## Out of scope (future)

Public/shareable profile link (binder `share.ts` pattern), avatar image upload,
username uniqueness, multiple profiles.
