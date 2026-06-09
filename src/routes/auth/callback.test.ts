import { describe, expect, it } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import { waitForSession } from "./callback";

type Auth = Parameters<typeof waitForSession>[0];

const fakeSession = {
	access_token: "tok",
	user: { id: "u1" },
} as unknown as Session;

/** Minimal auth stub: an initial getSession value + an optional async-emitted session. */
function makeAuth(opts: { initial: Session | null; emit?: Session | null }): Auth {
	return {
		async getSession() {
			return { data: { session: opts.initial }, error: null };
		},
		onAuthStateChange(cb: (event: string, session: Session | null) => void) {
			if (opts.emit !== undefined) {
				// supabase-js establishes a hash-flow session a tick after init.
				queueMicrotask(() => cb("SIGNED_IN", opts.emit ?? null));
			}
			return { data: { subscription: { unsubscribe() {} } } };
		},
	} as unknown as Auth;
}

describe("waitForSession", () => {
	it("returns the session immediately when getSession already has one", async () => {
		const s = await waitForSession(makeAuth({ initial: fakeSession }), 50);
		expect(s).toBe(fakeSession);
	});

	it("resolves a session that arrives later via onAuthStateChange (hash flow)", async () => {
		const s = await waitForSession(
			makeAuth({ initial: null, emit: fakeSession }),
			1000,
		);
		expect(s).toBe(fakeSession);
	});

	it("resolves null when no session arrives before the timeout (bad/expired link)", async () => {
		const s = await waitForSession(makeAuth({ initial: null }), 10);
		expect(s).toBeNull();
	});
});
