// src/store/userland/supabase-repo.ts
//
// SupabaseRepo — implements all 4 repo ports (CollectionRepo, BindersRepo,
// BackupRepo, ProfileRepo) over a supabase-js client. Delegates ALL row↔domain
// conversion to supabase-row.ts (the single conversion boundary).
//
// Rules (slice A):
//   • add() mints a client uuidv7() as the row id; NEVER sends user_id (DB default auth.uid())
//   • list() filters deleted_at is null (forward-compat with sub-project B tombstones)
//   • Delete = HARD delete (DELETE) in slice A
//   • ProfileRepo.save = upsert on id (the auth uid)
//   • Errors: throw with a descriptive message if the supabase call returns an error

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	BackupRepo,
	BindersRepo,
	CollectionRepo,
	ProfileRepo,
	UserlandRepos,
} from "./repo";
import {
	type BinderRow,
	binderToRow,
	type ProfileRow,
	profileToRow,
	rowToBinder,
	rowToProfile,
	rowToStack,
	type StackRow,
	stackToRow,
} from "./supabase-row";
import type {
	Binder,
	NewBinder,
	NewStack,
	Profile,
	Stack,
	UserDataSnapshot,
} from "./types";
import { uuidv7 } from "./uuid";

// ── error helper ──────────────────────────────────────────────────────────────

function assertOk(error: { message: string } | null, context: string): void {
	if (error) throw new Error(`SupabaseRepo [${context}]: ${error.message}`);
}

// ── CollectionRepo ────────────────────────────────────────────────────────────

function createCollectionRepo(client: SupabaseClient): CollectionRepo {
	return {
		async list(): Promise<Stack[]> {
			const { data, error } = await client
				.from("stacks")
				.select("*")
				.is("deleted_at", null);
			assertOk(error, "collection.list");
			return (data as StackRow[]).map(rowToStack);
		},

		async add(input: NewStack): Promise<Stack> {
			const id = uuidv7();
			const now = Date.now();

			// Build the domain record the same way idb-repo does, then convert to row.
			const stack: Stack = {
				id,
				cardId: input.cardId,
				quantity: input.quantity ?? 1,
				acquiredAt: input.acquiredAt ?? now,
				createdAt: now,
				updatedAt: now,
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

			const row = stackToRow(stack);
			// Never send user_id — DB stamps it from auth.uid().
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { data, error } = await client
				.from("stacks")
				.insert(row)
				.select()
				.single();
			assertOk(error, "collection.add");
			return rowToStack(data as StackRow);
		},

		async bulkAdd(inputs: NewStack[]): Promise<Stack[]> {
			if (inputs.length === 0) return [];
			const now = Date.now();

			const stacks: Stack[] = inputs.map((input) => ({
				id: uuidv7(),
				cardId: input.cardId,
				quantity: input.quantity ?? 1,
				acquiredAt: input.acquiredAt ?? now,
				createdAt: now,
				updatedAt: now,
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
			}));

			const rows = stacks.map(stackToRow);
			const { data, error } = await client.from("stacks").insert(rows).select();
			assertOk(error, "collection.bulkAdd");
			return (data as StackRow[]).map(rowToStack);
		},

		async update(
			id: string,
			patch: Parameters<CollectionRepo["update"]>[1],
		): Promise<void> {
			// Convert patch to row-level snake_case. Only include explicitly-provided keys.
			type RowPatch = Partial<StackRow> & { updated_at: string };
			const rowPatch: RowPatch = {
				updated_at: new Date().toISOString(),
			};

			if ("label" in patch) rowPatch.label = patch.label ?? null;
			if ("quantity" in patch) rowPatch.quantity = patch.quantity;
			if ("acquiredAt" in patch && patch.acquiredAt !== undefined)
				rowPatch.acquired_at = new Date(patch.acquiredAt).toISOString();
			if ("pricePaid" in patch) rowPatch.price_paid = patch.pricePaid ?? null;
			if ("currency" in patch && patch.currency !== undefined)
				rowPatch.currency = patch.currency;
			if ("language" in patch && patch.language !== undefined)
				rowPatch.language = patch.language;
			if ("variant" in patch) rowPatch.variant = patch.variant ?? null;
			if ("printing" in patch) rowPatch.printing = patch.printing ?? null;
			if ("notes" in patch) rowPatch.notes = patch.notes ?? null;
			if ("condition" in patch) rowPatch.condition = patch.condition ?? null;
			if ("source" in patch) rowPatch.source = patch.source ?? null;
			if ("storageLocation" in patch)
				rowPatch.storage_location = patch.storageLocation ?? null;
			if ("isPrimary" in patch && patch.isPrimary !== undefined)
				rowPatch.is_primary = patch.isPrimary;

			// Flatten grading
			if ("grading" in patch) {
				if (patch.grading === null) {
					rowPatch.grading_company = null;
					rowPatch.grading_grade = null;
					rowPatch.grading_cert = null;
				} else if (patch.grading !== undefined) {
					rowPatch.grading_company = patch.grading.company;
					rowPatch.grading_grade = patch.grading.grade;
					rowPatch.grading_cert = patch.grading.cert ?? null;
				}
			}

			const { error } = await client
				.from("stacks")
				.update(rowPatch)
				.eq("id", id);
			assertOk(error, "collection.update");
		},

		async remove(id: string): Promise<void> {
			const { error } = await client.from("stacks").delete().eq("id", id);
			assertOk(error, "collection.remove");
		},

		async removeMany(ids: string[]): Promise<void> {
			if (ids.length === 0) return;
			const { error } = await client.from("stacks").delete().in("id", ids);
			assertOk(error, "collection.removeMany");
		},

		async clear(): Promise<void> {
			// RLS ensures only the current user's rows are deleted.
			// We use a filter that matches all live rows owned by this user.
			// (The auth.uid() = user_id policy limits scope automatically.)
			const { error } = await client
				.from("stacks")
				.delete()
				.not("id", "is", null); // matches every row visible under RLS
			assertOk(error, "collection.clear");
		},
	};
}

// ── BindersRepo ───────────────────────────────────────────────────────────────

function createBindersRepo(client: SupabaseClient): BindersRepo {
	return {
		async list(): Promise<Binder[]> {
			const { data, error } = await client
				.from("binders")
				.select("*")
				.is("deleted_at", null);
			assertOk(error, "binders.list");
			return (data as BinderRow[]).map(rowToBinder);
		},

		async create(input: NewBinder): Promise<Binder> {
			const now = Date.now();
			const binder: Binder = {
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

			const row = binderToRow(binder);
			const { data, error } = await client
				.from("binders")
				.insert(row)
				.select()
				.single();
			assertOk(error, "binders.create");
			return rowToBinder(data as BinderRow);
		},

		async update(
			id: string,
			patch: Parameters<BindersRepo["update"]>[1],
		): Promise<void> {
			type RowPatch = Partial<BinderRow> & { updated_at: string };
			const rowPatch: RowPatch = {
				updated_at: new Date().toISOString(),
			};

			if ("name" in patch && patch.name !== undefined)
				rowPatch.name = patch.name;
			if ("description" in patch)
				rowPatch.description = patch.description ?? null;
			if ("rules" in patch && patch.rules !== undefined)
				rowPatch.rules = patch.rules;
			if ("includeCardIds" in patch && patch.includeCardIds !== undefined)
				rowPatch.include_card_ids = patch.includeCardIds;
			if ("excludeCardIds" in patch && patch.excludeCardIds !== undefined)
				rowPatch.exclude_card_ids = patch.excludeCardIds;

			const { error } = await client
				.from("binders")
				.update(rowPatch)
				.eq("id", id);
			assertOk(error, "binders.update");
		},

		async remove(id: string): Promise<void> {
			const { error } = await client.from("binders").delete().eq("id", id);
			assertOk(error, "binders.remove");
		},

		async clear(): Promise<void> {
			const { error } = await client
				.from("binders")
				.delete()
				.not("id", "is", null);
			assertOk(error, "binders.clear");
		},
	};
}

// ── ProfileRepo ───────────────────────────────────────────────────────────────

function createProfileRepo(client: SupabaseClient): ProfileRepo {
	return {
		async get(): Promise<Profile | null> {
			const {
				data: { user },
			} = await client.auth.getUser();
			if (!user) return null;

			const { data, error } = await client
				.from("profiles")
				.select("*")
				.eq("id", user.id)
				.is("deleted_at", null)
				.maybeSingle();
			assertOk(error, "profile.get");
			if (!data) return null;
			return rowToProfile(data as ProfileRow);
		},

		async save(patch: Parameters<ProfileRepo["save"]>[0]): Promise<Profile> {
			const {
				data: { user },
			} = await client.auth.getUser();
			if (!user)
				throw new Error("SupabaseRepo [profile.save]: no authenticated user");

			const now = Date.now();

			// Fetch existing to preserve createdAt (upsert would reset it to now() via trigger
			// only on UPDATE — but we need to track the createdAt ourselves for the domain).
			const { data: existing } = await client
				.from("profiles")
				.select("*")
				.eq("id", user.id)
				.maybeSingle();

			const existingProfile = existing
				? rowToProfile(existing as ProfileRow)
				: null;

			const profile: Profile = existingProfile
				? {
						...existingProfile,
						...{
							displayName: patch.displayName ?? existingProfile.displayName,
							bio: "bio" in patch ? (patch.bio ?? null) : existingProfile.bio,
							avatarPreset: patch.avatarPreset ?? existingProfile.avatarPreset,
							favoriteSetId:
								"favoriteSetId" in patch
									? (patch.favoriteSetId ?? null)
									: existingProfile.favoriteSetId,
							displayLanguage:
								patch.displayLanguage ?? existingProfile.displayLanguage,
							displayCurrency:
								patch.displayCurrency ?? existingProfile.displayCurrency,
							hideValue: patch.hideValue ?? existingProfile.hideValue,
						},
						updatedAt: now,
					}
				: {
						id: user.id,
						displayName: patch.displayName ?? "Collector",
						bio: patch.bio ?? null,
						avatarPreset: patch.avatarPreset ?? "dusk",
						favoriteSetId: patch.favoriteSetId ?? null,
						displayLanguage: patch.displayLanguage ?? "en",
						displayCurrency: patch.displayCurrency ?? "USD",
						hideValue: patch.hideValue ?? false,
						createdAt: now,
						updatedAt: now,
						deletedAt: null,
					};

			const row = profileToRow(profile);
			const { data, error } = await client
				.from("profiles")
				.upsert(row, { onConflict: "id" })
				.select()
				.single();
			assertOk(error, "profile.save");
			return rowToProfile(data as ProfileRow);
		},

		async clear(): Promise<void> {
			const {
				data: { user },
			} = await client.auth.getUser();
			if (!user) return;
			const { error } = await client
				.from("profiles")
				.delete()
				.eq("id", user.id);
			assertOk(error, "profile.clear");
		},
	};
}

// ── BackupRepo ────────────────────────────────────────────────────────────────

function createBackupRepo(
	collection: CollectionRepo,
	binders: BindersRepo,
	profile: ProfileRepo,
	client: SupabaseClient,
): BackupRepo {
	return {
		async exportAll(): Promise<UserDataSnapshot> {
			const [stacks, bindersList, prof] = await Promise.all([
				collection.list(),
				binders.list(),
				profile.get(),
			]);
			return {
				schemaVersion: 6 as const,
				exportedAt: Date.now(),
				collection: stacks,
				binders: bindersList,
				profile: prof,
			};
		},

		async importAll(
			snapshot: UserDataSnapshot,
			mode: "replace" | "merge",
		): Promise<void> {
			const {
				data: { user },
			} = await client.auth.getUser();
			if (!user)
				throw new Error(
					"SupabaseRepo [backup.importAll]: no authenticated user",
				);

			if (mode === "replace") {
				// Clear existing data first
				await Promise.all([
					collection.clear(),
					binders.clear(),
					profile.clear(),
				]);
			}

			// Insert stacks: rows are full records (preserve ids); upsert on id for merge mode.
			if (snapshot.collection.length > 0) {
				const rows = snapshot.collection.map(stackToRow);
				// mode=replace: already cleared, plain insert; mode=merge: upsert to avoid dup-key
				const { error: stacksError } = await client
					.from("stacks")
					.upsert(rows, { onConflict: "id" });
				assertOk(stacksError, "backup.importAll stacks");
			}

			// Insert binders
			if (snapshot.binders.length > 0) {
				const rows = snapshot.binders.map(binderToRow);
				const { error: bindersError } = await client
					.from("binders")
					.upsert(rows, { onConflict: "id" });
				assertOk(bindersError, "backup.importAll binders");
			}

			// Insert profile (if present); remap id to auth uid (claim's job deferred,
			// but here we always write to the current user's uid so it's safe)
			if (snapshot.profile) {
				const profileToWrite: Profile = {
					...snapshot.profile,
					id: user.id, // always keyed by auth uid in the cloud
				};
				const row = profileToRow(profileToWrite);
				const { error: profileError } = await client
					.from("profiles")
					.upsert(row, { onConflict: "id" });
				assertOk(profileError, "backup.importAll profile");
			}
		},
	};
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a UserlandRepos bundle backed by a Supabase client.
 * The client must have an active session (auth.uid() must resolve).
 * Pass the result of `getBrowserClient()` in app code, or an authenticated
 * test client in integration tests.
 */
export function createSupabaseRepo(client: SupabaseClient): UserlandRepos {
	const collection = createCollectionRepo(client);
	const binders = createBindersRepo(client);
	const profile = createProfileRepo(client);
	const backup = createBackupRepo(collection, binders, profile, client);
	return { collection, binders, backup, profile };
}
