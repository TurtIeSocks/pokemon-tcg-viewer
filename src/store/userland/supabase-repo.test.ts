// src/store/userland/supabase-repo.test.ts
//
// INTEGRATION LANE — requires the local Supabase stack (`supabase start`).
// Tests are SKIPPED (not failed) if the stack is unreachable.
// Run explicitly: bun test src/store/userland/supabase-repo.test.ts
//
// Uses the service_role key (from env) ONLY via the admin API to create + confirm
// a test user, then signs in as that user to exercise repo methods as an RLS-bounded
// authenticated session. The service_role key is NEVER written to app code.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRepo } from "./supabase-repo";
import type { UserDataSnapshot } from "./types";

// ── Stack connectivity check ──────────────────────────────────────────────────

const API_URL = "http://127.0.0.1:55321";
const ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Read service_role from env (set by caller; never committed). Falls back to the
// well-known local demo service_role JWT (same as `supabase status -o env` prints).
const SERVICE_ROLE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ??
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let supabaseAvailable = false;

async function checkStackReachable(): Promise<boolean> {
	try {
		const res = await fetch(`${API_URL}/rest/v1/`, {
			headers: { apikey: ANON_KEY },
			signal: AbortSignal.timeout(3000),
		});
		return res.ok || res.status === 200 || res.status === 404;
	} catch {
		return false;
	}
}

// ── Test user management ──────────────────────────────────────────────────────

const TEST_EMAIL = `test-supabase-repo-${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-secure-123";

let testUserId: string | null = null;
// The anon client signed in as the test user (used by the repos)
// biome-ignore lint/suspicious/noExplicitAny: supabase generic params are complex; 'any' is fine for test helper
let testUserAnonClient: SupabaseClient<any> | null = null;

async function createAndSignInTestUser(): Promise<boolean> {
	// Admin client (service_role) to create + confirm the user
	const adminClient = createClient(API_URL, SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	// Create user via admin API
	const { data: createData, error: createError } =
		await adminClient.auth.admin.createUser({
			email: TEST_EMAIL,
			password: TEST_PASSWORD,
			email_confirm: true, // auto-confirm
		});

	if (createError || !createData.user) {
		console.error("[supabase-repo test] createUser failed:", createError);
		return false;
	}
	testUserId = createData.user.id;

	// Sign in as the test user using the anon client
	const anonClient = createClient(API_URL, ANON_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	const { error: signInError } = await anonClient.auth.signInWithPassword({
		email: TEST_EMAIL,
		password: TEST_PASSWORD,
	});
	if (signInError) {
		console.error("[supabase-repo test] signIn failed:", signInError);
		return false;
	}
	testUserAnonClient = anonClient;
	return true;
}

async function deleteTestUser(): Promise<void> {
	if (!testUserId) return;
	const adminClient = createClient(API_URL, SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	await adminClient.auth.admin.deleteUser(testUserId);
}

// ── Setup/teardown ────────────────────────────────────────────────────────────

beforeAll(async () => {
	supabaseAvailable = await checkStackReachable();
	if (!supabaseAvailable) {
		console.log(
			"[supabase-repo test] Stack unreachable at",
			API_URL,
			"— skipping all tests",
		);
		return;
	}
	const ok = await createAndSignInTestUser();
	if (!ok) {
		supabaseAvailable = false;
		console.log(
			"[supabase-repo test] Could not create/sign-in test user — skipping",
		);
	}
});

afterAll(async () => {
	if (testUserId) await deleteTestUser();
});

function skip(msg: string) {
	console.log(`[SKIP] ${msg}`);
}

// ── CollectionRepo ────────────────────────────────────────────────────────────

describe("CollectionRepo", () => {
	test("add + list round-trip", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const added = await repos.collection.add({
			cardId: "xy1-1",
			quantity: 2,
			language: "ja",
			notes: "integration test",
			pricePaid: 999,
			currency: "USD",
		});

		expect(added.id).toBeString();
		expect(added.cardId).toBe("xy1-1");
		expect(added.quantity).toBe(2);
		expect(added.language).toBe("ja");
		expect(added.notes).toBe("integration test");
		expect(added.pricePaid).toBe(999);
		expect(added.currency).toBe("USD");
		expect(added.grading).toBeNull();
		expect(added.deletedAt).toBeNull();
		expect(typeof added.createdAt).toBe("number");
		expect(typeof added.updatedAt).toBe("number");

		const list = await repos.collection.list();
		expect(list.length).toBe(1);
		expect(list[0].id).toBe(added.id);
		expect(list[0].cardId).toBe("xy1-1");
	});

	test("add never sends user_id (DB stamps from auth.uid())", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const added = await repos.collection.add({ cardId: "base1-4" });
		expect(added.id).toBeString();

		// If user_id were missing, RLS would reject the insert and we'd get an error.
		// Successful add + list proves DB stamped it correctly.
		const list = await repos.collection.list();
		expect(list.some((s) => s.id === added.id)).toBe(true);
	});

	test("grading round-trip (company+grade+cert)", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const added = await repos.collection.add({
			cardId: "base1-4",
			grading: { company: "PSA", grade: 10, cert: "12345678" },
		});

		expect(added.grading).toEqual({
			company: "PSA",
			grade: 10,
			cert: "12345678",
		});

		const list = await repos.collection.list();
		expect(list[0].grading).toEqual({
			company: "PSA",
			grade: 10,
			cert: "12345678",
		});
	});

	test("grading cert null when not recorded", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const added = await repos.collection.add({
			cardId: "base1-4",
			grading: { company: "BGS", grade: 9.5, cert: null },
		});
		expect(added.grading).toEqual({ company: "BGS", grade: 9.5, cert: null });
	});

	test("bulkAdd returns all records", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const items = await repos.collection.bulkAdd([
			{ cardId: "xy1-1", quantity: 1 },
			{ cardId: "xy1-2", quantity: 3 },
			{ cardId: "xy1-3", quantity: 2 },
		]);

		expect(items.length).toBe(3);
		const cardIds = items.map((i) => i.cardId).sort();
		expect(cardIds).toEqual(["xy1-1", "xy1-2", "xy1-3"]);

		const list = await repos.collection.list();
		expect(list.length).toBe(3);
	});

	test("update merges patch", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const added = await repos.collection.add({
			cardId: "xy1-1",
			notes: "old note",
		});
		await repos.collection.update(added.id, {
			notes: "new note",
			pricePaid: 500,
		});

		const list = await repos.collection.list();
		expect(list[0].notes).toBe("new note");
		expect(list[0].pricePaid).toBe(500);
		// unchanged field preserved
		expect(list[0].cardId).toBe("xy1-1");
	});

	test("update clears field when null", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const added = await repos.collection.add({
			cardId: "xy1-1",
			notes: "some note",
		});
		await repos.collection.update(added.id, { notes: null });

		const list = await repos.collection.list();
		expect(list[0].notes).toBeNull();
	});

	test("remove hard-deletes a row", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const added = await repos.collection.add({ cardId: "xy1-1" });
		await repos.collection.remove(added.id);

		const list = await repos.collection.list();
		expect(list.length).toBe(0);
	});

	test("removeMany hard-deletes multiple rows", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		const [a, b, c] = await repos.collection.bulkAdd([
			{ cardId: "xy1-1" },
			{ cardId: "xy1-2" },
			{ cardId: "xy1-3" },
		]);
		await repos.collection.removeMany([a.id, c.id]);

		const list = await repos.collection.list();
		expect(list.length).toBe(1);
		expect(list[0].id).toBe(b.id);
	});

	test("clear removes all rows", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);

		await repos.collection.bulkAdd([{ cardId: "xy1-1" }, { cardId: "xy1-2" }]);
		await repos.collection.clear();

		const list = await repos.collection.list();
		expect(list.length).toBe(0);
	});

	test("list hides soft-deleted rows (deleted_at is not null)", async () => {
		// Directly insert a row with deleted_at set via admin to simulate a tombstone.
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();

		// Add a live row
		const added = await repos.collection.add({ cardId: "xy1-99" });

		// Simulate soft-delete by directly updating the row via the admin (service_role bypasses RLS)
		const adminClient = createClient(API_URL, SERVICE_ROLE_KEY, {
			auth: { autoRefreshToken: false, persistSession: false },
		});
		await adminClient
			.from("stacks")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", added.id);

		const list = await repos.collection.list();
		expect(list.every((s) => s.id !== added.id)).toBe(true);
	});
});

// ── BindersRepo ───────────────────────────────────────────────────────────────

describe("BindersRepo", () => {
	test("create + list", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.binders.clear();

		const b = await repos.binders.create({
			name: "Fire Types",
			description: "My fire binder",
		});
		expect(b.id).toBeString();
		expect(b.name).toBe("Fire Types");
		expect(b.description).toBe("My fire binder");
		expect(b.rules).toEqual([]);
		expect(b.includeCardIds).toEqual([]);
		expect(b.excludeCardIds).toEqual([]);
		expect(b.deletedAt).toBeNull();

		const list = await repos.binders.list();
		expect(list.length).toBe(1);
		expect(list[0].id).toBe(b.id);
	});

	test("update merges patch", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.binders.clear();

		const b = await repos.binders.create({ name: "Test Binder" });
		await repos.binders.update(b.id, {
			name: "Updated Binder",
			includeCardIds: ["xy1-1", "xy1-2"],
			excludeCardIds: ["xy1-3"],
		});

		const list = await repos.binders.list();
		expect(list[0].name).toBe("Updated Binder");
		expect(list[0].includeCardIds).toEqual(["xy1-1", "xy1-2"]);
		expect(list[0].excludeCardIds).toEqual(["xy1-3"]);
	});

	test("rules jsonb round-trip", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.binders.clear();

		const rule = {
			id: "rule-1",
			query: {
				text: "charizard",
				setId: null,
				dexNumber: null,
				types: ["Fire"],
				rarities: [],
				supertypes: [],
				subtypes: [],
				yearMin: null,
				yearMax: null,
				mode: "fuzzy" as const,
			},
		};

		const b = await repos.binders.create({ name: "Test" });
		await repos.binders.update(b.id, { rules: [rule] });

		const list = await repos.binders.list();
		expect(list[0].rules).toEqual([rule]);
	});

	test("remove hard-deletes", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.binders.clear();

		const b = await repos.binders.create({ name: "To Delete" });
		await repos.binders.remove(b.id);

		const list = await repos.binders.list();
		expect(list.length).toBe(0);
	});

	test("clear removes all", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);

		await repos.binders.create({ name: "A" });
		await repos.binders.create({ name: "B" });
		await repos.binders.clear();

		const list = await repos.binders.list();
		expect(list.length).toBe(0);
	});
});

// ── ProfileRepo ───────────────────────────────────────────────────────────────

describe("ProfileRepo", () => {
	test("get returns null when no profile saved", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.profile.clear();

		const p = await repos.profile.get();
		expect(p).toBeNull();
	});

	test("save creates profile on first call", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.profile.clear();

		const p = await repos.profile.save({
			displayName: "Rin",
			bio: "Collects Fire types",
			avatarPreset: "ember",
			favoriteSetId: "base1",
		});

		expect(p.displayName).toBe("Rin");
		expect(p.bio).toBe("Collects Fire types");
		expect(p.avatarPreset).toBe("ember");
		expect(p.favoriteSetId).toBe("base1");
		expect(p.id).toBeString();
		expect(typeof p.createdAt).toBe("number");
		expect(typeof p.updatedAt).toBe("number");
		expect(p.deletedAt).toBeNull();
	});

	test("save upserts on subsequent calls", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.profile.clear();

		const first = await repos.profile.save({ displayName: "Rin" });
		const second = await repos.profile.save({
			displayName: "Rin Updated",
			bio: "New bio",
		});

		expect(second.id).toBe(first.id); // same uid, upserted
		expect(second.displayName).toBe("Rin Updated");
		expect(second.bio).toBe("New bio");
		// createdAt stable across upserts
		expect(second.createdAt).toBe(first.createdAt);
	});

	test("get returns saved profile", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.profile.clear();

		await repos.profile.save({ displayName: "Rin" });
		const p = await repos.profile.get();
		expect(p).not.toBeNull();
		expect(p?.displayName).toBe("Rin");
	});

	test("profile id is auth uid", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.profile.clear();

		const {
			data: { user },
		} = await testUserAnonClient.auth.getUser();
		expect(user).not.toBeNull();

		const p = await repos.profile.save({ displayName: "Test" });
		expect(p.id).toBe(user?.id ?? "");
	});
});

// ── BackupRepo ────────────────────────────────────────────────────────────────

describe("BackupRepo — exportAll/importAll round-trip", () => {
	test("exportAll returns current state", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();
		await repos.binders.clear();
		await repos.profile.clear();

		await repos.collection.add({ cardId: "xy1-1", quantity: 2 });
		await repos.binders.create({ name: "My Binder" });
		await repos.profile.save({ displayName: "Rin" });

		const snap = await repos.backup.exportAll();
		expect(snap.schemaVersion).toBe(6);
		expect(snap.collection.length).toBe(1);
		expect(snap.binders.length).toBe(1);
		expect(snap.profile).not.toBeNull();
		expect(snap.profile?.displayName).toBe("Rin");
	});

	test("importAll replace: clears + writes snapshot", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();
		await repos.binders.clear();
		await repos.profile.clear();

		// Pre-populate
		await repos.collection.add({ cardId: "xy1-old" });
		await repos.binders.create({ name: "Old Binder" });

		// Build a snapshot with different data
		const now = Date.now();
		const snapshot: UserDataSnapshot = {
			schemaVersion: 5,
			exportedAt: now,
			collection: [
				{
					id: "01900000-0000-7000-8000-000000000099",
					cardId: "base1-4",
					quantity: 1,
					acquiredAt: now,
					createdAt: now,
					updatedAt: now,
					deletedAt: null,
					label: null,
					pricePaid: null,
					currency: "USD",
					language: "en",
					variant: null,
					notes: null,
					condition: null,
					grading: null,
					source: null,
					storageLocation: null,
					isPrimary: false,
				},
			],
			binders: [
				{
					id: "01900000-0000-7000-8000-000000000098",
					name: "Imported Binder",
					description: null,
					rules: [],
					includeCardIds: [],
					excludeCardIds: [],
					createdAt: now,
					updatedAt: now,
					deletedAt: null,
				},
			],
			profile: null,
		};

		await repos.backup.importAll(snapshot, "replace");

		const stacks = await repos.collection.list();
		expect(stacks.length).toBe(1);
		expect(stacks[0].cardId).toBe("base1-4");
		expect(stacks[0].id).toBe("01900000-0000-7000-8000-000000000099");

		const binders = await repos.binders.list();
		expect(binders.length).toBe(1);
		expect(binders[0].name).toBe("Imported Binder");
	});

	test("importAll merge: upserts without deleting existing", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();
		await repos.binders.clear();
		await repos.profile.clear();

		// Pre-populate existing
		const existing = await repos.collection.add({ cardId: "xy1-existing" });

		const now = Date.now();
		const snapshot: UserDataSnapshot = {
			schemaVersion: 5,
			exportedAt: now,
			collection: [
				{
					id: "01900000-0000-7000-8000-000000000077",
					cardId: "xy1-new",
					quantity: 1,
					acquiredAt: now,
					createdAt: now,
					updatedAt: now,
					deletedAt: null,
					label: null,
					pricePaid: null,
					currency: "USD",
					language: "en",
					variant: null,
					notes: null,
					condition: null,
					grading: null,
					source: null,
					storageLocation: null,
					isPrimary: false,
				},
			],
			binders: [],
			profile: null,
		};

		await repos.backup.importAll(snapshot, "merge");

		const stacks = await repos.collection.list();
		expect(stacks.length).toBe(2);
		const cardIds = stacks.map((s) => s.cardId).sort();
		expect(cardIds).toContain("xy1-existing");
		expect(cardIds).toContain("xy1-new");
		expect(stacks.find((s) => s.id === existing.id)).toBeTruthy();
	});

	test("full export→import→export round-trip (ids preserved)", async () => {
		if (!supabaseAvailable || !testUserAnonClient) {
			skip("stack unavailable");
			return;
		}
		const repos = createSupabaseRepo(testUserAnonClient);
		await repos.collection.clear();
		await repos.binders.clear();
		await repos.profile.clear();

		await repos.collection.add({
			cardId: "xy1-1",
			quantity: 3,
			pricePaid: 250,
		});
		await repos.binders.create({ name: "Round-trip Binder" });
		await repos.profile.save({ displayName: "Round-trip User" });

		const snap1 = await repos.backup.exportAll();

		// Clear and re-import
		await repos.collection.clear();
		await repos.binders.clear();
		await repos.profile.clear();

		await repos.backup.importAll(snap1, "replace");

		const snap2 = await repos.backup.exportAll();
		expect(snap2.collection.length).toBe(1);
		expect(snap2.collection[0].id).toBe(snap1.collection[0].id);
		expect(snap2.collection[0].cardId).toBe("xy1-1");
		expect(snap2.collection[0].pricePaid).toBe(250);
		expect(snap2.binders.length).toBe(1);
		expect(snap2.binders[0].id).toBe(snap1.binders[0].id);
		expect(snap2.profile?.displayName).toBe("Round-trip User");
	});
});
