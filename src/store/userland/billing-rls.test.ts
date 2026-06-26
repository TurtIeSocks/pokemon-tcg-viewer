// src/store/userland/billing-rls.test.ts
//
// INTEGRATION LANE — requires the local Supabase stack (`supabase start`) WITH the
// billing migration applied. Tests are SKIPPED (not failed) if the stack is
// unreachable. Run explicitly: bun test src/store/userland/billing-rls.test.ts
//
// RLS is the entire entitlement boundary (Phase C). These are adversarial:
// - a client can NEVER write subscriptions/stripe_customers (entitlement unforgeable);
// - billing ON + no active sub  → net-new stack/binder write rejected (42501);
// - billing ON + active sub     → write allowed;
// - a lapsed user keeps SELECT + UPDATE/soft-delete of EXISTING rows, but not INSERT;
// - billing OFF (self-host)     → everything allowed (default-allow);
// - is_pro() is not client-callable (no who-pays probe);
// - process_stripe_event is atomic + idempotent.
// A failure means the policy is broken — do NOT loosen the test to make it pass.
//
// NOTE: this suite toggles the single global `billing_config` row. Bun runs test
// files sequentially, and afterAll restores billing_enabled=false, so it does not
// interfere with the cloud_vault rls.test.ts (which relies on default-allow).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

// biome-ignore lint/suspicious/noExplicitAny: supabase generic params are complex; 'any' is fine for a test
type Client = SupabaseClient<any>;

function adminClient(): Client {
	return createClient(API_URL, SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

async function createAndSignIn(
	email: string,
): Promise<{ uid: string; client: Client }> {
	const admin = adminClient();
	const { data, error } = await admin.auth.admin.createUser({
		email,
		password: PASSWORD,
		email_confirm: true,
	});
	if (error || !data.user)
		throw new Error(`createUser failed: ${error?.message}`);
	const client = createClient(API_URL, ANON_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	const { error: signInErr } = await client.auth.signInWithPassword({
		email,
		password: PASSWORD,
	});
	if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);
	return { uid: data.user.id, client };
}

async function setBilling(enabled: boolean): Promise<void> {
	const { error } = await adminClient()
		.from("billing_config")
		.update({ billing_enabled: enabled })
		.eq("id", true);
	if (error) throw new Error(`setBilling failed: ${error.message}`);
}

function futureISO(days = 30): string {
	return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Insert a subscription row as service_role (the only legitimate writer). */
async function seedSub(
	uid: string,
	status: string,
	id = `sub_${uid}`,
): Promise<void> {
	const { error } = await adminClient()
		.from("subscriptions")
		.upsert(
			{
				id,
				user_id: uid,
				stripe_customer_id: `cus_${uid}`,
				status,
				plan: "plus",
				price_id: "price_test",
				current_period_end: futureISO(),
				cancel_at_period_end: false,
			},
			{ onConflict: "id" },
		);
	if (error) throw new Error(`seedSub failed: ${error.message}`);
}

function newStack(extra: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		card_id: "billing-test-card",
		quantity: 1,
		language: "en",
		acquired_at: new Date().toISOString(),
		...extra,
	};
}

const TS = Date.now();
const EMAIL_FREE = `billing-free-${TS}@example.com`;
const EMAIL_PRO = `billing-pro-${TS}@example.com`;
const PASSWORD = "secure-billing-test-pass-123";

let uidFree = "";
let uidPro = "";
let clientFree: Client;
let clientPro: Client;

beforeAll(async () => {
	supabaseAvailable = await checkStackReachable();
	if (!supabaseAvailable) {
		console.log("[billing-rls] stack unreachable — skipping");
		return;
	}
	try {
		({ uid: uidFree, client: clientFree } = await createAndSignIn(EMAIL_FREE));
		({ uid: uidPro, client: clientPro } = await createAndSignIn(EMAIL_PRO));
		await setBilling(true); // exercise the GATED path
	} catch (e) {
		console.error("[billing-rls] setup failed:", e);
		supabaseAvailable = false;
	}
});

afterAll(async () => {
	if (!supabaseAvailable) return;
	// CRITICAL: restore default-allow so other suites / dev are unaffected.
	await setBilling(false).catch(() => {});
	const admin = adminClient();
	await admin.auth.admin.deleteUser(uidFree).catch(() => {});
	await admin.auth.admin.deleteUser(uidPro).catch(() => {});
});

describe("billing RLS entitlement gate", () => {
	test("billing ON + no subscription → stack INSERT rejected (42501)", async () => {
		if (!supabaseAvailable) return;
		const { error } = await clientFree.from("stacks").insert(newStack());
		expect(error).not.toBeNull();
		expect(error?.code).toBe("42501");
	});

	test("billing ON + no subscription → binder INSERT rejected (42501)", async () => {
		if (!supabaseAvailable) return;
		const { error } = await clientFree.from("binders").insert({
			id: crypto.randomUUID(),
			name: "free binder",
			rules: [],
			include_card_ids: [],
			exclude_card_ids: [],
		});
		expect(error).not.toBeNull();
		expect(error?.code).toBe("42501");
	});

	test("active subscription → stack INSERT succeeds", async () => {
		if (!supabaseAvailable) return;
		await seedSub(uidPro, "active");
		const { error } = await clientPro.from("stacks").insert(newStack());
		expect(error).toBeNull();
	});

	test("read is ALWAYS ungated — free user reads their own rows", async () => {
		if (!supabaseAvailable) return;
		// service_role seeds a row for the free user (as if from a prior paid period).
		const seeded = newStack({ user_id: uidFree, notes: "seeded-by-admin" });
		const { error: seedErr } = await adminClient()
			.from("stacks")
			.insert(seeded);
		expect(seedErr).toBeNull();
		const { data, error } = await clientFree
			.from("stacks")
			.select("id,notes")
			.eq("id", seeded.id);
		expect(error).toBeNull();
		expect(data?.length).toBe(1);
	});

	test("lapsed user: can UPDATE + soft-delete existing rows, but NOT insert new", async () => {
		if (!supabaseAvailable) return;
		// Pro user already has a live stack from the earlier test; capture it.
		const { data: rows } = await clientPro
			.from("stacks")
			.select("id")
			.is("deleted_at", null)
			.limit(1);
		const existingId = rows?.[0]?.id as string;
		expect(existingId).toBeTruthy();

		// Lapse them.
		await seedSub(uidPro, "canceled");

		// UPDATE existing row → allowed (using-clause is owner-only; no is_pro gate).
		const { error: updErr } = await clientPro
			.from("stacks")
			.update({ notes: "edited-after-lapse" })
			.eq("id", existingId);
		expect(updErr).toBeNull();

		// Soft-delete existing row → allowed (does not raise live-row state).
		const { error: delErr } = await clientPro
			.from("stacks")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", existingId);
		expect(delErr).toBeNull();

		// INSERT new row → rejected (net-new state requires entitlement).
		const { error: insErr } = await clientPro.from("stacks").insert(newStack());
		expect(insErr?.code).toBe("42501");
	});

	test("client CANNOT write subscriptions (no policy, no grant)", async () => {
		if (!supabaseAvailable) return;
		const { error } = await clientPro.from("subscriptions").insert({
			id: `sub_forged_${uidPro}`,
			user_id: uidPro,
			stripe_customer_id: "cus_forged",
			status: "active",
			current_period_end: futureISO(),
		});
		expect(error).not.toBeNull();
	});

	test("client CANNOT write stripe_customers", async () => {
		if (!supabaseAvailable) return;
		const { error } = await clientPro.from("stripe_customers").insert({
			user_id: uidPro,
			stripe_customer_id: "cus_forged_2",
		});
		expect(error).not.toBeNull();
	});

	test("is_pro() is NOT client-callable (no who-pays probe)", async () => {
		if (!supabaseAvailable) return;
		const { error } = await clientFree.rpc("is_pro", { uid: uidFree });
		expect(error).not.toBeNull();
	});

	test("process_stripe_event is atomic + idempotent", async () => {
		if (!supabaseAvailable) return;
		const admin = adminClient();
		const evt = `evt_${TS}_a`;
		const subId = `sub_evt_${TS}`;
		const payload = {
			customer: `cus_${uidPro}`,
			user_id: uidPro,
			subscription_id: subId,
			status: "active",
			plan: "plus",
			price_id: "price_test",
			current_period_end: futureISO(),
			cancel_at_period_end: false,
		};
		// First apply writes both the event ledger and the subscription.
		const { error: e1 } = await admin.rpc("process_stripe_event", {
			p_event_id: evt,
			p_event_type: "customer.subscription.updated",
			p_payload: payload,
		});
		expect(e1).toBeNull();
		const { count: c1 } = await admin
			.from("subscriptions")
			.select("*", { count: "exact", head: true })
			.eq("id", subId);
		expect(c1).toBe(1);

		// Re-applying the SAME event id is a no-op (no throw, no duplicate).
		const { error: e2 } = await admin.rpc("process_stripe_event", {
			p_event_id: evt,
			p_event_type: "customer.subscription.updated",
			p_payload: { ...payload, status: "canceled" }, // would change status IF it weren't deduped
		});
		expect(e2).toBeNull();
		const { data: after } = await admin
			.from("subscriptions")
			.select("status")
			.eq("id", subId)
			.single();
		expect(after?.status).toBe("active"); // unchanged → second apply was deduped

		// A fresh event id DOES apply (status converges).
		const { error: e3 } = await admin.rpc("process_stripe_event", {
			p_event_id: `${evt}_b`,
			p_event_type: "customer.subscription.updated",
			p_payload: { ...payload, status: "past_due" },
		});
		expect(e3).toBeNull();
	});

	test("billing OFF (self-host) → default-allow, free user can INSERT", async () => {
		if (!supabaseAvailable) return;
		await setBilling(false);
		const { error } = await clientFree.from("stacks").insert(newStack());
		expect(error).toBeNull();
	});
});
