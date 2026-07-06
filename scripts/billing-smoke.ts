// Stripe test-mode E2E smoke: DB-side assertions for scripts/billing-smoke.md.
//
// The human drives the browser (checkout, portal, `stripe trigger …`); this
// script polls Postgres via a service-role client and prints PASS/FAIL so you
// don't have to re-type `select status, plan from subscriptions;` by hand.
//
// Usage:
//   bun run scripts/billing-smoke.ts wait-active   <user-email>
//   bun run scripts/billing-smoke.ts wait-canceled  <user-email>
//   bun run scripts/billing-smoke.ts show           <user-email>
//   bun run scripts/billing-smoke.ts billing-config
//
// Env (no defaults, no secrets committed — export before running):
//   SUPABASE_URL               e.g. http://localhost:55321 (local `supabase start`)
//   SUPABASE_SERVICE_ROLE_KEY  service_role key (local stack: `supabase status -o json`)
//
// Service-role reads bypass RLS by design — fine for a local smoke tool, never
// ship this key to a browser or CI secret that isn't the deploy host itself.
import { createClient } from "@supabase/supabase-js";

const USAGE = `Stripe test-mode E2E smoke — DB assertion helper.

Usage:
  bun run scripts/billing-smoke.ts wait-active   <user-email>
  bun run scripts/billing-smoke.ts wait-canceled <user-email>
  bun run scripts/billing-smoke.ts show          <user-email>
  bun run scripts/billing-smoke.ts billing-config

Required env (export before running, never commit):
  SUPABASE_URL               local stack: http://localhost:55321
  SUPABASE_SERVICE_ROLE_KEY  local stack: \`supabase status -o json\` → service_role key

See scripts/billing-smoke.md for the full walkthrough (checkout, portal, webhook forwarding).`;

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

interface SubscriptionRow {
	id: string;
	status: string;
	plan: string;
	current_period_end: string;
	cancel_at_period_end: boolean;
}

/** Terminal statuses this smoke kit waits on. Stripe also has trialing,
 * incomplete, incomplete_expired, paused — not exercised by this drill. */
type WaitTarget = "active" | "canceled" | "unpaid";

function readEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(USAGE);
		console.error(`\nMissing required env var: ${name}`);
		process.exit(1);
	}
	return value;
}

function getClient() {
	const url = readEnv("SUPABASE_URL");
	const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
	return createClient(url, serviceRoleKey, {
		auth: { persistSession: false },
	});
}

/** Resolve a user's auth.users id from their email via the admin API
 * (service-role only — this is not exposed to normal clients). */
async function findUserId(
	client: ReturnType<typeof getClient>,
	email: string,
): Promise<string> {
	const { data, error } = await client.auth.admin.listUsers();
	if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
	const user = data.users.find((u) => u.email === email);
	if (!user) {
		throw new Error(
			`no auth user with email ${email} — sign in via dev:preview or magic link first`,
		);
	}
	return user.id;
}

async function fetchSubscription(
	client: ReturnType<typeof getClient>,
	userId: string,
): Promise<SubscriptionRow | null> {
	const { data, error } = await client
		.from("subscriptions")
		.select("id, status, plan, current_period_end, cancel_at_period_end")
		.eq("user_id", userId)
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw new Error(`subscriptions read failed: ${error.message}`);
	return data;
}

/** Poll `subscriptions` until it reaches the target status, or time out. */
async function waitForStatus(
	client: ReturnType<typeof getClient>,
	userId: string,
	target: WaitTarget,
): Promise<void> {
	const startedAt = Date.now();
	for (;;) {
		const row = await fetchSubscription(client, userId);
		if (row?.status === target) {
			console.log(
				`PASS: subscription ${row.id} reached status=${target} (plan=${row.plan})`,
			);
			return;
		}
		console.log(
			`... current status=${row?.status ?? "(no row yet)"}, waiting for ${target}`,
		);
		if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
			console.error(
				`FAIL: timed out after ${POLL_TIMEOUT_MS}ms waiting for status=${target} (last seen: ${row?.status ?? "no row"})`,
			);
			process.exit(1);
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
}

async function showSubscription(
	client: ReturnType<typeof getClient>,
	userId: string,
): Promise<void> {
	const row = await fetchSubscription(client, userId);
	if (!row) {
		console.log("(no subscriptions row for this user — expected pre-checkout)");
		return;
	}
	console.log(JSON.stringify(row, null, 2));
}

/** R16 misconfig check: is billing wired but the flag left off, or vice versa. */
async function showBillingConfig(
	client: ReturnType<typeof getClient>,
): Promise<void> {
	const { data, error } = await client
		.from("billing_config")
		.select("billing_enabled")
		.eq("id", true)
		.maybeSingle();
	if (error) throw new Error(`billing_config read failed: ${error.message}`);
	console.log(
		`billing_config.billing_enabled = ${data?.billing_enabled ?? "(missing row)"}`,
	);
	if (!data?.billing_enabled) {
		console.log(
			"NOTE: billing is OFF — is_pro() default-allows everyone. Flip billing_config.billing_enabled=true before testing entitlement gating.",
		);
	}
}

if (import.meta.main) {
	const [command, arg] = process.argv.slice(2);
	if (!command) {
		console.error(USAGE);
		process.exit(1);
	}

	const client = getClient();
	const requireArg = (): string => {
		if (!arg) {
			console.error(USAGE);
			console.error("\nMissing required argument: <user-email>");
			process.exit(1);
		}
		return arg;
	};

	switch (command) {
		case "wait-active":
		case "wait-canceled": {
			const target: WaitTarget =
				command === "wait-active" ? "active" : "canceled";
			const userId = await findUserId(client, requireArg());
			await waitForStatus(client, userId, target);
			break;
		}
		case "show": {
			const userId = await findUserId(client, requireArg());
			await showSubscription(client, userId);
			break;
		}
		case "billing-config":
			await showBillingConfig(client);
			break;
		default:
			console.error(USAGE);
			console.error(`\nUnknown command: ${command}`);
			process.exit(1);
	}
}
