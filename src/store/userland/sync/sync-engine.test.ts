// src/store/userland/sync/sync-engine.test.ts
//
// INTEGRATION LANE — requires the local Supabase stack (`supabase start`).
// Tests are SKIPPED (not failed) if the stack is unreachable.
// Run explicitly: bun test src/store/userland/sync/sync-engine.test.ts
//
// Pattern: two caches A+B sharing one cloud, signed-in as a test user.
// Validates: push (A→cloud), pull (cloud→B), conflict (LWW), binder-merge
// (union), tombstone propagation, no-op second pass.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { allRows, createCacheRepos } from "./cache-repo";
import { getWatermark, syncOnce } from "./sync-engine";

// ── Stack connectivity check ──────────────────────────────────────────────────

const API_URL = "http://127.0.0.1:55321";
const ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
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

// ── Test user setup ───────────────────────────────────────────────────────────

const TEST_EMAIL = `test-sync-engine-${Date.now()}@example.com`;
const TEST_PASSWORD = "test-password-secure-123";

let testUserId: string | null = null;
// biome-ignore lint/suspicious/noExplicitAny: supabase generic params are complex; 'any' is fine in tests
let testUserClient: SupabaseClient<any> | null = null;
// "UID A" and "UID B" are different cache namespaces (simulating two devices)
// but they share the same authenticated cloud session (same user).
let uidA: string;
let uidB: string;

async function createAndSignInTestUser(): Promise<boolean> {
	const adminClient = createClient(API_URL, SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	const { data: createData, error: createError } =
		await adminClient.auth.admin.createUser({
			email: TEST_EMAIL,
			password: TEST_PASSWORD,
			email_confirm: true,
		});
	if (createError || !createData.user) {
		console.error("[sync-engine test] createUser failed:", createError);
		return false;
	}
	testUserId = createData.user.id;
	uidA = `${testUserId}-device-a`;
	uidB = `${testUserId}-device-b`;

	const anonClient = createClient(API_URL, ANON_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	const { error: signInError } = await anonClient.auth.signInWithPassword({
		email: TEST_EMAIL,
		password: TEST_PASSWORD,
	});
	if (signInError) {
		console.error("[sync-engine test] signIn failed:", signInError);
		return false;
	}
	testUserClient = anonClient;
	return true;
}

async function deleteTestUser(): Promise<void> {
	if (!testUserId) return;
	const adminClient = createClient(API_URL, SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	await adminClient.auth.admin.deleteUser(testUserId);
}

// Wipe all cloud data for the test user between scenarios
async function clearCloud(): Promise<void> {
	if (!testUserClient) return;
	await Promise.all([
		testUserClient.from("stacks").delete().not("id", "is", null),
		testUserClient.from("binders").delete().not("id", "is", null),
	]);
}

function skip(msg: string) {
	console.log(`[SKIP] ${msg}`);
}

// ── Setup/teardown ────────────────────────────────────────────────────────────

beforeAll(async () => {
	supabaseAvailable = await checkStackReachable();
	if (!supabaseAvailable) {
		console.log(
			"[sync-engine test] Stack unreachable at",
			API_URL,
			"— skipping all tests",
		);
		return;
	}
	const ok = await createAndSignInTestUser();
	if (!ok) {
		supabaseAvailable = false;
		console.log(
			"[sync-engine test] Could not create/sign-in test user — skipping",
		);
	}
});

afterAll(async () => {
	if (testUserId) await deleteTestUser();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sync-engine integration", () => {
	test("A writes a stack → syncOnce(A) pushes → syncOnce(B) pulls it", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		await reposA.collection.clear();

		// A writes a stack locally
		const stack = await reposA.collection.add({
			cardId: "base1-4",
			quantity: 1,
		});

		// A syncs → pushes to cloud
		await syncOnce(uidA, testUserClient);

		// B syncs → should pull A's stack into B's cache
		const reposB = createCacheRepos(uidB);
		await reposB.collection.clear();
		await syncOnce(uidB, testUserClient);

		const bStacks = await reposB.collection.list();
		expect(bStacks.some((s) => s.cardId === "base1-4")).toBe(true);

		// Verify A's stack id survived the round-trip
		expect(bStacks.some((s) => s.id === stack.id)).toBe(true);
	});

	test("conflict: both A and B edit the same stack offline → last-push-wins", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		// Seed the same stack in both caches and cloud
		const reposA = createCacheRepos(uidA);
		const reposB = createCacheRepos(uidB);
		await reposA.collection.clear();
		await reposB.collection.clear();

		const stackA = await reposA.collection.add({
			cardId: "xy1-1",
			notes: "original",
		});

		// Sync A → cloud (stack exists on cloud now)
		await syncOnce(uidA, testUserClient);

		// Sync B → B now has the stack
		await syncOnce(uidB, testUserClient);

		// Both A and B edit the same stack "offline"
		await reposA.collection.update(stackA.id, { notes: "A edit" });
		await reposB.collection.update(stackA.id, { notes: "B edit" });

		// A syncs first (A's edit pushes)
		await syncOnce(uidA, testUserClient);

		// B syncs next (B's edit pushes, wins by server time)
		await syncOnce(uidB, testUserClient);

		// After B's push, cloud has B's version. A syncs once more to see B's win.
		await syncOnce(uidA, testUserClient);

		const aStacks = await reposA.collection.list();
		const aStack = aStacks.find((s) => s.id === stackA.id);
		expect(aStack).toBeDefined();
		// B pushed last → last-push-wins: A sees "B edit"
		expect(aStack?.notes).toBe("B edit");
	});

	test("binder: A adds card X, B adds card Y → after both sync, union (both present)", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		const reposB = createCacheRepos(uidB);
		await reposA.binders.clear();
		await reposB.binders.clear();

		// A creates binder with card X
		const binderA = await reposA.binders.create({ name: "Union Binder" });
		await reposA.binders.update(binderA.id, { includeCardIds: ["card-X"] });

		// A syncs → binder is on cloud
		await syncOnce(uidA, testUserClient);

		// B syncs → B gets the binder
		await syncOnce(uidB, testUserClient);

		// B edits the binder offline: adds card Y
		await reposB.binders.update(binderA.id, {
			includeCardIds: ["card-X", "card-Y"],
		});

		// Also A edits offline: adds card Z
		await reposA.binders.update(binderA.id, {
			includeCardIds: ["card-X", "card-Z"],
		});

		// A syncs first
		await syncOnce(uidA, testUserClient);

		// B syncs (conflict → array-merge: result should have X+Y+Z)
		await syncOnce(uidB, testUserClient);

		const bBinders = await reposB.binders.list();
		const b = bBinders.find((b) => b.id === binderA.id);
		expect(b).toBeDefined();
		expect(b?.includeCardIds).toContain("card-X");
		expect(b?.includeCardIds).toContain("card-Y");
		// B's push result will be uploaded; A re-syncs to see merged version
		await syncOnce(uidA, testUserClient);
		const aBinders = await reposA.binders.list();
		const a = aBinders.find((b) => b.id === binderA.id);
		expect(a?.includeCardIds).toContain("card-X");
	});

	test("tombstone: A soft-removes a stack → syncOnce(B) → gone from B's list()", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		const reposB = createCacheRepos(uidB);
		await reposA.collection.clear();
		await reposB.collection.clear();

		// Seed both
		const stackA = await reposA.collection.add({ cardId: "xy9-9" });
		await syncOnce(uidA, testUserClient);
		await syncOnce(uidB, testUserClient);

		// Verify B has the stack
		let bStacks = await reposB.collection.list();
		expect(bStacks.some((s) => s.id === stackA.id)).toBe(true);

		// A soft-removes (cache repo.remove = soft-delete)
		await reposA.collection.remove(stackA.id);
		await syncOnce(uidA, testUserClient);

		// B syncs → should see tombstone → gone from list()
		await syncOnce(uidB, testUserClient);
		bStacks = await reposB.collection.list();
		expect(bStacks.every((s) => s.id !== stackA.id)).toBe(true);

		// But the row is still in allRows (tombstone preserved)
		const allB = await allRows(uidB, "stacks");
		const tombstone = allB.find((s) => s.id === stackA.id);
		expect(tombstone).toBeDefined();
		expect(tombstone?.deletedAt).not.toBeNull();
	});

	test("second syncOnce with no changes is a no-op (pulled=0, pushed=0)", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		await reposA.collection.clear();

		await reposA.collection.add({ cardId: "hs1-1" });
		await syncOnce(uidA, testUserClient);

		// Second sync: nothing new, nothing dirty
		const result = await syncOnce(uidA, testUserClient);
		expect(result.pulled).toBe(0);
		expect(result.pushed).toBe(0);
	});

	test("watermark advances after sync", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		await reposA.collection.clear();

		const before = await getWatermark(uidA);
		await reposA.collection.add({ cardId: "wm-card" });
		await syncOnce(uidA, testUserClient);
		const after = await getWatermark(uidA);

		expect(after > before).toBe(true);
	});
});
