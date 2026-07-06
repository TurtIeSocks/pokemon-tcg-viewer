// src/store/userland/sync/sync-engine.test.ts
//
// INTEGRATION LANE — requires the local Supabase stack (`supabase start`).
// Tests are SKIPPED (not failed) if the stack is unreachable.
// Run explicitly: bun test src/store/userland/sync/sync-engine.test.ts
//
// Pattern: two caches A+B sharing one cloud, signed-in as a test user.
// Validates: push (A→cloud), pull (cloud→B), conflict (LWW), binder-merge
// (union), tombstone propagation, quiescence (push → echo-pull → no-op),
// watermark advancement from pulled rows only (never from pushed rows).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { allRows, createCacheRepos } from "./cache-repo";
import { getWatermark, setWatermark, syncOnce } from "./sync-engine";

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

	// Contract: the watermark advances only from PULLED rows — pushed rows'
	// server timestamps are deliberately excluded (see sync-engine.ts header).
	// A push-only pass therefore leaves the watermark unchanged; the NEXT pass
	// pulls the pushed rows back (harmless echo) and only then advances. True
	// quiescence is reached on the third pass.
	test("sync reaches quiescence: push pass → echo-pull pass → true no-op pass", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		await reposA.collection.clear();
		// Drain leftover state from earlier tests (clear() re-dirties rows as
		// tombstones): one pass to push it, one to absorb the echoes, so the
		// staged counts below are deterministic.
		await syncOnce(uidA, testUserClient);
		await syncOnce(uidA, testUserClient);

		const watermarkBefore = await getWatermark(uidA);
		await reposA.collection.add({ cardId: "hs1-1" });

		// Pass 1: pushes the new row; nothing to pull → watermark unchanged.
		const pass1 = await syncOnce(uidA, testUserClient);
		expect(pass1.pushed).toBe(1);
		expect(pass1.pulled).toBe(0);
		expect(await getWatermark(uidA)).toBe(watermarkBefore);

		// Pass 2: pulls the pushed row back (echo → no-op reconcile), nothing
		// dirty to push → watermark advances to the echoed row's updated_at.
		const pass2 = await syncOnce(uidA, testUserClient);
		expect(pass2.pulled).toBe(1);
		expect(pass2.pushed).toBe(0);
		const watermarkAfterEcho = await getWatermark(uidA);
		expect(watermarkAfterEcho > watermarkBefore).toBe(true);

		// Pass 3: true no-op — nothing pulled, nothing pushed, watermark still.
		const pass3 = await syncOnce(uidA, testUserClient);
		expect(pass3.pulled).toBe(0);
		expect(pass3.pushed).toBe(0);
		expect(await getWatermark(uidA)).toBe(watermarkAfterEcho);
	});

	// Contract: the watermark advances only from PULLED rows — pushed rows'
	// server timestamps are deliberately excluded (see sync-engine.ts header).
	// So it advances on the pass AFTER a push, when the pushed rows echo back
	// through the pull.
	test("watermark advances after sync (via the echo pull, not the push)", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		await reposA.collection.clear();
		// Drain leftover dirty state so the push-only pass below is isolated.
		await syncOnce(uidA, testUserClient);
		await syncOnce(uidA, testUserClient);

		const before = await getWatermark(uidA);
		await reposA.collection.add({ cardId: "wm-card" });

		// Push-only pass: nothing pulled → watermark must NOT move.
		await syncOnce(uidA, testUserClient);
		expect(await getWatermark(uidA)).toBe(before);

		// Echo pass: the pushed row comes back through the pull → advances.
		await syncOnce(uidA, testUserClient);
		const after = await getWatermark(uidA);
		expect(after > before).toBe(true);
	});

	// ── Regression: watermark race from push-returned timestamps ──────────────
	//
	// Plan finding: folding PUSHED rows' updated_at into the watermark can
	// advance it past a row from another device that was pulled in the SAME
	// pass but happens to have an earlier server timestamp than what A just
	// pushed. If the watermark were pinned to the later push timestamp
	// instead of the max PULLED timestamp, A's *next* pull
	// (`gt("updated_at", watermark)`) would still be correct here (B's row
	// already landed in this pass) — but the watermark value itself would be
	// wrong, silently masking future rows that land between B's timestamp and
	// A's push timestamp. This test pins the watermark to a known value right
	// before B's row lands, then has A pull B's row AND push a row of its own
	// in one pass, and asserts the resulting watermark equals B's (pulled)
	// timestamp exactly — never A's (pushed) timestamp.
	test("watermark race: a push must never advance the watermark past an un-pulled row", async () => {
		if (!supabaseAvailable || !testUserClient) {
			skip("stack unavailable");
			return;
		}
		await clearCloud();

		const reposA = createCacheRepos(uidA);
		const reposB = createCacheRepos(uidB);
		await reposA.collection.clear();
		await reposB.collection.clear();

		// Baseline: nothing to pull, watermark starts at epoch-ish "before B".
		const watermarkBeforeB = await getWatermark(uidA);

		// B commits a row -> gets a server updated_at ("T0.5"), strictly after
		// watermarkBeforeB.
		const bStack = await reposB.collection.add({ cardId: "race-b-card" });
		await syncOnce(uidB, testUserClient);

		const { data: bRow } = await testUserClient
			.from("stacks")
			.select("updated_at")
			.eq("id", bStack.id)
			.single();
		const bTimestamp = (bRow as { updated_at: string }).updated_at;
		expect(bTimestamp > watermarkBeforeB).toBe(true);

		// Roll A's watermark back to just before B's row so this pass's pull
		// query (`gt("updated_at", watermark)`) is guaranteed to include it —
		// then push an unrelated dirty row of A's own in the SAME pass. If
		// push-returned timestamps leak into the watermark, the watermark
		// could jump to A's push timestamp; assert it never exceeds the max
		// PULLED timestamp for this pass.
		await setWatermark(uidA, watermarkBeforeB);
		await reposA.collection.add({ cardId: "race-a-card" });
		const result = await syncOnce(uidA, testUserClient);

		// Sanity: this pass really did both pull B's row and push A's row.
		expect(result.pulled).toBeGreaterThanOrEqual(1);
		expect(result.pushed).toBeGreaterThanOrEqual(1);

		const aStacks = await reposA.collection.list();
		expect(aStacks.some((s) => s.id === bStack.id)).toBe(true);

		const watermarkAfter = await getWatermark(uidA);
		// The watermark after this pass must not exceed the max timestamp
		// among rows actually PULLED (B's row). It must not be pinned to a
		// later push-returned timestamp for A's own row.
		expect(watermarkAfter).toBe(bTimestamp);

		// Now simulate a SECOND concurrent write from B that lands strictly
		// between bTimestamp and "now". A syncs again with no local writes
		// (pure pull). If the earlier pass had wrongly advanced the
		// watermark past bTimestamp, this pull would still work for a NEW
		// row — so the real proof is the assertion above. This second pass
		// just confirms normal forward progress still works post-fix.
		const bStack2 = await reposB.collection.add({ cardId: "race-b-card-2" });
		await syncOnce(uidB, testUserClient);
		await syncOnce(uidA, testUserClient);
		const aStacksAfter2 = await reposA.collection.list();
		expect(aStacksAfter2.some((s) => s.id === bStack2.id)).toBe(true);
	});
});
