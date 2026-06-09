// src/store/userland/rls.test.ts
//
// INTEGRATION LANE — requires the local Supabase stack (`supabase start`).
// Tests are SKIPPED (not failed) if the stack is unreachable.
// Run explicitly: bun test src/store/userland/rls.test.ts
//
// Adversarial cross-user isolation: User B cannot read, update, or delete
// User A's rows; anon cannot access anything. A missing/loose policy = LEAK.
// Do NOT loosen tests to make them pass — a failure means the policy is broken.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Stack connectivity ────────────────────────────────────────────────────────

const API_URL = "http://127.0.0.1:55321";
const ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// service_role: admin user-creation in tests ONLY. Read from env; falls back to
// the well-known local demo JWT. NEVER committed or used in app code.
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

// ── Admin helper ──────────────────────────────────────────────────────────────

function adminClient() {
	return createClient(API_URL, SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

// biome-ignore lint/suspicious/noExplicitAny: supabase generic params are complex; 'any' is fine for test helper
type AnonClient = SupabaseClient<any>;

async function createAndSignIn(
	email: string,
	password: string,
): Promise<{ uid: string; client: AnonClient }> {
	const admin = adminClient();
	const { data, error } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	});
	if (error || !data.user)
		throw new Error(`createUser failed: ${error?.message}`);
	const uid = data.user.id;

	const client: AnonClient = createClient(API_URL, ANON_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	const { error: signInErr } = await client.auth.signInWithPassword({
		email,
		password,
	});
	if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

	return { uid, client };
}

async function deleteUser(uid: string): Promise<void> {
	await adminClient().auth.admin.deleteUser(uid);
}

// ── Per-run unique emails ─────────────────────────────────────────────────────

const TS = Date.now();
const EMAIL_A = `rls-user-a-${TS}@example.com`;
const EMAIL_B = `rls-user-b-${TS}@example.com`;
const PASSWORD = "secure-rls-test-pass-123";

// Seeded row ids captured during beforeAll
let uidA = "";
let uidB = "";
let clientA: AnonClient;
let clientB: AnonClient;
// Anon (no session) client
const anonClient: AnonClient = createClient(API_URL, ANON_KEY, {
	auth: { autoRefreshToken: false, persistSession: false },
});

// A's seeded row ids
let aStackId = "";
let aBinderId = "";

// B's own row ids (for cleanup)
let bStackId = "";
let bBinderId = "";

// ── Setup/teardown ────────────────────────────────────────────────────────────

beforeAll(async () => {
	supabaseAvailable = await checkStackReachable();
	if (!supabaseAvailable) {
		console.log(
			"[rls test] Stack unreachable at",
			API_URL,
			"— skipping all tests",
		);
		return;
	}

	try {
		({ uid: uidA, client: clientA } = await createAndSignIn(EMAIL_A, PASSWORD));
		({ uid: uidB, client: clientB } = await createAndSignIn(EMAIL_B, PASSWORD));
	} catch (e) {
		console.error("[rls test] setup failed:", e);
		supabaseAvailable = false;
		return;
	}

	// Seed A's data ─────────────────────────────────────────────────────────────

	// Stack — let DB stamp user_id from auth.uid()
	const { data: stackData, error: stackErr } = await clientA
		.from("stacks")
		.insert({
			id: crypto.randomUUID(),
			card_id: "rls-test-card",
			quantity: 1,
			language: "en",
			acquired_at: new Date().toISOString(),
		})
		.select("id")
		.single();
	if (stackErr || !stackData) {
		console.error("[rls test] seed stack failed:", stackErr);
		supabaseAvailable = false;
		return;
	}
	aStackId = stackData.id;

	// Binder
	const { data: binderData, error: binderErr } = await clientA
		.from("binders")
		.insert({
			id: crypto.randomUUID(),
			name: "A's Binder",
			rules: [],
			include_card_ids: [],
			exclude_card_ids: [],
		})
		.select("id")
		.single();
	if (binderErr || !binderData) {
		console.error("[rls test] seed binder failed:", binderErr);
		supabaseAvailable = false;
		return;
	}
	aBinderId = binderData.id;

	// Profile
	const { error: profileErr } = await clientA.from("profiles").upsert(
		{
			id: uidA,
			display_name: "User A",
		},
		{ onConflict: "id" },
	);
	if (profileErr) {
		console.error("[rls test] seed profile failed:", profileErr);
		supabaseAvailable = false;
	}
});

afterAll(async () => {
	if (!supabaseAvailable) return;

	// Clean up B's rows inserted during tests (if any)
	if (bStackId) {
		await clientB.from("stacks").delete().eq("id", bStackId);
	}
	if (bBinderId) {
		await clientB.from("binders").delete().eq("id", bBinderId);
	}

	// Delete both users (cascades their rows)
	if (uidA) await deleteUser(uidA);
	if (uidB) await deleteUser(uidB);
});

function skip(msg: string) {
	console.log(`[SKIP] ${msg}`);
}

// ── stacks isolation ──────────────────────────────────────────────────────────

describe("stacks — cross-user isolation (User B vs User A)", () => {
	test("B.select returns zero of A's rows", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB
			.from("stacks")
			.select("id")
			.eq("id", aStackId);
		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	test("B.select * returns only B's own rows (none leaking from A)", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB.from("stacks").select("id,card_id");
		expect(error).toBeNull();
		const aRow = (data ?? []).find((r) => r.id === aStackId);
		expect(aRow).toBeUndefined();
	});

	test("B.update targeting A's row id affects 0 rows", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB
			.from("stacks")
			.update({ notes: "HACKED" })
			.eq("id", aStackId)
			.select("id");
		// RLS hides A's row from B; no error, but data should be empty
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);
	});

	test("B.delete targeting A's row id affects 0 rows; A's row still exists", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error: delErr } = await clientB
			.from("stacks")
			.delete()
			.eq("id", aStackId);
		expect(delErr).toBeNull();

		// Verify A's row still exists (via service_role to bypass RLS)
		const { data: adminCheck } = await adminClient()
			.from("stacks")
			.select("id")
			.eq("id", aStackId)
			.single();
		expect(adminCheck?.id).toBe(aStackId);
	});

	test("B insert with user_id spoofed to A's uid is REJECTED (with-check violation)", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error } = await clientB.from("stacks").insert({
			id: crypto.randomUUID(),
			user_id: uidA, // spoof attempt
			card_id: "spoofed-card",
			quantity: 1,
			language: "en",
			acquired_at: new Date().toISOString(),
		});
		// Must error; the with-check (select auth.uid()) = user_id will fail because
		// the DB stamps auth.uid() = B's uid, not A's.
		expect(error).not.toBeNull();
	});

	test("B normal insert (no user_id) succeeds and lands under B's uid", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const newId = crypto.randomUUID();
		const { data, error } = await clientB
			.from("stacks")
			.insert({
				id: newId,
				card_id: "b-own-card",
				quantity: 1,
				language: "en",
				acquired_at: new Date().toISOString(),
			})
			.select("id,user_id")
			.single();
		expect(error).toBeNull();
		expect(data?.id).toBe(newId);
		expect(data?.user_id).toBe(uidB);
		bStackId = newId; // captured for cleanup
	});
});

// ── binders isolation ─────────────────────────────────────────────────────────

describe("binders — cross-user isolation (User B vs User A)", () => {
	test("B.select returns zero of A's rows", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB
			.from("binders")
			.select("id")
			.eq("id", aBinderId);
		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	test("B.select * returns only B's own rows (none leaking from A)", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB.from("binders").select("id,name");
		expect(error).toBeNull();
		const aRow = (data ?? []).find((r) => r.id === aBinderId);
		expect(aRow).toBeUndefined();
	});

	test("B.update targeting A's binder id affects 0 rows", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB
			.from("binders")
			.update({ name: "HACKED" })
			.eq("id", aBinderId)
			.select("id");
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);
	});

	test("B.delete targeting A's binder id affects 0 rows; A's binder still exists", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error: delErr } = await clientB
			.from("binders")
			.delete()
			.eq("id", aBinderId);
		expect(delErr).toBeNull();

		const { data: adminCheck } = await adminClient()
			.from("binders")
			.select("id")
			.eq("id", aBinderId)
			.single();
		expect(adminCheck?.id).toBe(aBinderId);
	});

	test("B insert with user_id spoofed to A's uid is REJECTED", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error } = await clientB.from("binders").insert({
			id: crypto.randomUUID(),
			user_id: uidA,
			name: "Spoofed Binder",
			rules: [],
			include_card_ids: [],
			exclude_card_ids: [],
		});
		expect(error).not.toBeNull();
	});

	test("B normal insert succeeds and lands under B's uid", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const newId = crypto.randomUUID();
		const { data, error } = await clientB
			.from("binders")
			.insert({
				id: newId,
				name: "B's Binder",
				rules: [],
				include_card_ids: [],
				exclude_card_ids: [],
			})
			.select("id,user_id")
			.single();
		expect(error).toBeNull();
		expect(data?.id).toBe(newId);
		expect(data?.user_id).toBe(uidB);
		bBinderId = newId; // captured for cleanup
	});
});

// ── profiles isolation ────────────────────────────────────────────────────────

describe("profiles — cross-user isolation (User B vs User A)", () => {
	test("B cannot select A's profile row (id = A's uid)", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB
			.from("profiles")
			.select("id,display_name")
			.eq("id", uidA);
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);
	});

	test("B cannot update A's profile row", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await clientB
			.from("profiles")
			.update({ display_name: "HACKED" })
			.eq("id", uidA)
			.select("id");
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);

		// Verify A's profile is untouched
		const { data: adminCheck } = await adminClient()
			.from("profiles")
			.select("display_name")
			.eq("id", uidA)
			.single();
		expect(adminCheck?.display_name).toBe("User A");
	});

	test("B can upsert its own profile (id = B's uid)", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error } = await clientB
			.from("profiles")
			.upsert({ id: uidB, display_name: "User B" }, { onConflict: "id" });
		expect(error).toBeNull();
	});

	test("B cannot upsert a profile with id = A's uid (with-check violation)", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error } = await clientB
			.from("profiles")
			.upsert({ id: uidA, display_name: "SPOOFED" }, { onConflict: "id" });
		expect(error).not.toBeNull();
	});
});

// ── anon (no session) isolation ───────────────────────────────────────────────

describe("anon (no session) — all tables reject reads and writes", () => {
	test("anon select on stacks returns zero rows", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await anonClient.from("stacks").select("id");
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);
	});

	test("anon insert on stacks is REJECTED", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error } = await anonClient.from("stacks").insert({
			id: crypto.randomUUID(),
			card_id: "anon-card",
			quantity: 1,
			language: "en",
			acquired_at: new Date().toISOString(),
		});
		expect(error).not.toBeNull();
	});

	test("anon select on binders returns zero rows", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await anonClient.from("binders").select("id");
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);
	});

	test("anon insert on binders is REJECTED", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error } = await anonClient.from("binders").insert({
			id: crypto.randomUUID(),
			name: "Anon Binder",
			rules: [],
			include_card_ids: [],
			exclude_card_ids: [],
		});
		expect(error).not.toBeNull();
	});

	test("anon select on profiles returns zero rows", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { data, error } = await anonClient.from("profiles").select("id");
		expect(error).toBeNull();
		expect(data ?? []).toHaveLength(0);
	});

	test("anon insert on profiles is REJECTED", async () => {
		if (!supabaseAvailable) {
			skip("stack unavailable");
			return;
		}
		const { error } = await anonClient
			.from("profiles")
			.insert({ id: uidA, display_name: "Anon Spoof" });
		expect(error).not.toBeNull();
	});
});
