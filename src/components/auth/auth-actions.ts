// Auth action helpers — the thin seam between the auth UI and supabase-js.
// Kept in a `.ts` sibling (no React) so the `.tsx` components export only
// components (avoids the react-refresh/only-export-components warning).
import { getBrowserClient } from "@/lib/supabase/client";

/** The path the magic link returns to; must be in `additional_redirect_urls`. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** Where to land after a successful sign-in. */
export const POST_SIGN_IN_PATH = "/vault";

/**
 * Absolute callback URL for `emailRedirectTo`, derived from the live origin so
 * it works on localhost and any deploy host without hardcoding. Returns "" in a
 * non-browser context (SSR) — sign-in only runs client-side.
 */
export function authCallbackUrl(): string {
	if (typeof window === "undefined") return "";
	return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

/**
 * Send a magic-link email (passwordless OTP). The link returns the user to
 * {@link authCallbackUrl}, which exchanges it for a session.
 *
 * @returns an error message string on failure, or `null` on success.
 */
export async function sendMagicLink(email: string): Promise<string | null> {
	const { error } = await getBrowserClient().auth.signInWithOtp({
		email,
		options: { emailRedirectTo: authCallbackUrl() },
	});
	return error ? error.message : null;
}

/** Sign the current user out (clears the session cookies). */
export async function signOut(): Promise<void> {
	await getBrowserClient().auth.signOut();
}
