import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { POST_SIGN_IN_PATH } from "@/components/auth/auth-actions";
import { Button } from "@/components/ui/button";
import { BezelPanel } from "@/components/ui/glass";
import { getBrowserClient, isCloudEnabled } from "@/lib/supabase/client";
import { m } from "@/paraglide/messages";

/**
 * Search params on the magic-link return URL. Supabase delivers EITHER:
 *  - `code`  → PKCE flow (the `@supabase/ssr` browser-client default) →
 *    `exchangeCodeForSession(code)`; or
 *  - `token_hash` + `type` → email-OTP confirm flow → `verifyOtp({token_hash,type})`.
 * Handling both makes the callback correct regardless of the email template.
 * `error` / `error_description` arrive when the provider rejects the link.
 */
interface CallbackSearch {
	code?: string;
	token_hash?: string;
	type?: string;
	error?: string;
	error_description?: string;
}

export const Route = createFileRoute("/auth/callback")({
	validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
		code: typeof search.code === "string" ? search.code : undefined,
		token_hash:
			typeof search.token_hash === "string" ? search.token_hash : undefined,
		type: typeof search.type === "string" ? search.type : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
		error_description:
			typeof search.error_description === "string"
				? search.error_description
				: undefined,
	}),
	head: () => ({ meta: [{ title: m.auth_callback_meta_title() }] }),
	component: AuthCallback,
});

type Phase = "exchanging" | "error";

/**
 * Resolve the current session, waiting briefly for the one `supabase-js`
 * establishes ASYNCHRONOUSLY from a magic link's URL hash (implicit flow) —
 * there's no query `code`/`token_hash` to act on in that case, but the session
 * still lands a tick later via `detectSessionInUrl`. Returns null if none
 * arrives within the timeout (genuinely bad/expired link).
 */
export async function waitForSession(
	auth: ReturnType<typeof getBrowserClient>["auth"],
	timeoutMs = 4000,
): Promise<Session | null> {
	const { data } = await auth.getSession();
	if (data.session) return data.session;
	return new Promise((resolve) => {
		const { data: sub } = auth.onAuthStateChange((_event, session) => {
			if (session) {
				sub.subscription.unsubscribe();
				resolve(session);
			}
		});
		setTimeout(() => {
			sub.subscription.unsubscribe();
			resolve(null);
		}, timeoutMs);
	});
}

function AuthCallback() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const [phase, setPhase] = useState<Phase>("exchanging");
	const [message, setMessage] = useState<string>("");

	useEffect(() => {
		let cancelled = false;
		const fail = (msg: string) => {
			if (!cancelled) {
				setMessage(msg);
				setPhase("error");
			}
		};

		async function run() {
			if (!isCloudEnabled()) {
				fail(m.auth_cloud_off_message());
				return;
			}
			// Provider rejected the link (expired, already used, etc.).
			if (search.error) {
				fail(search.error_description ?? search.error);
				return;
			}

			const auth = getBrowserClient().auth;
			try {
				// Act on whatever the link carried as a QUERY param (PKCE `code` or
				// email-OTP `token_hash`). A magic link may instead deliver the session
				// in the URL HASH (implicit flow), which supabase-js consumes on its own —
				// nothing to do here for that case.
				if (search.code) {
					const { error } = await auth.exchangeCodeForSession(search.code);
					if (error) return fail(error.message);
				} else if (search.token_hash) {
					const { error } = await auth.verifyOtp({
						token_hash: search.token_hash,
						type: (search.type ?? "email") as EmailOtpType,
					});
					if (error) return fail(error.message);
				}

				// Success is defined by "a session now exists", however it arrived
				// (exchange, verifyOtp, or the async hash flow) — NOT by which query
				// param was present. Only fail if no session lands.
				const session = await waitForSession(auth);
				if (!session) {
					return fail(m.auth_link_expired_message());
				}
			} catch (e) {
				return fail(
					e instanceof Error ? e.message : m.auth_signin_snag_message(),
				);
			}

			if (!cancelled) {
				// Replace so the consumed link isn't left in history.
				void navigate({ to: POST_SIGN_IN_PATH, replace: true });
			}
		}

		void run();
		return () => {
			cancelled = true;
		};
	}, [search, navigate]);

	return (
		<div className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center px-4">
			<BezelPanel className="w-full text-center">
				{phase === "exchanging" ? (
					<div className="space-y-2 py-4">
						<p className="font-display text-lg font-semibold text-(--ink)">
							{m.auth_signing_you_in()}
						</p>
						<p className="text-sm text-(--ink-muted)">
							{m.auth_checking_magic_link()}
						</p>
					</div>
				) : (
					<div className="space-y-4 py-4">
						<div className="space-y-1.5">
							<p className="font-display text-lg font-semibold text-(--ink)">
								{m.auth_link_failed_title()}
							</p>
							<p className="text-sm text-(--ink-muted)">{message}</p>
						</div>
						<Button asChild variant="soft" size="sm">
							<Link to="/vault">{m.auth_back_to_vault()}</Link>
						</Button>
					</div>
				)}
			</BezelPanel>
		</div>
	);
}
