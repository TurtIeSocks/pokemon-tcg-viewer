"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getBrowserClient, isCloudEnabled } from "@/lib/supabase/client";

/** Auth-session snapshot for the UI. */
export interface AuthSessionState {
	/** `undefined` while loading, `null` when signed out, else the session. */
	session: Session | null | undefined;
	/** The signed-in user's email, if any. */
	email: string | null;
	/** True once the initial session check has resolved. */
	ready: boolean;
}

/**
 * Read-only auth-session state for gating auth UI (which control to show, the
 * signed-in email). Cloud-disabled → always signed-out + ready. This subscribes
 * to `onAuthStateChange` purely to drive presentation; the Vault's repo swap +
 * re-hydration on auth changes is wired separately (it must not live here).
 */
export function useAuthSession(): AuthSessionState {
	const [session, setSession] = useState<Session | null | undefined>(
		isCloudEnabled() ? undefined : null,
	);

	useEffect(() => {
		if (!isCloudEnabled()) {
			setSession(null);
			return;
		}
		const auth = getBrowserClient().auth;
		let active = true;

		void auth.getSession().then(({ data }) => {
			if (active) setSession(data.session);
		});

		const { data: sub } = auth.onAuthStateChange((_event, next) => {
			if (active) setSession(next);
		});

		return () => {
			active = false;
			sub.subscription.unsubscribe();
		};
	}, []);

	return {
		session,
		email: session?.user.email ?? null,
		ready: session !== undefined,
	};
}
