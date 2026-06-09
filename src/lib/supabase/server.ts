// Server-side Supabase client for TanStack Start (SSR).
//
// The app renders server-side, so the auth session must exist on BOTH sides.
// `@supabase/ssr` stores the session in cookies; this client bridges those
// cookies to the TanStack Start request/response so SSR sees the logged-in user
// and token refreshes are written back via `Set-Cookie`.
//
// TanStack Start (v1.168) exposes the active request's cookies/response headers
// ambiently through AsyncLocalStorage — `getCookies()` reads the incoming
// `Cookie` header, `setCookie()` / `setResponseHeader()` write to the outgoing
// response. No request object needs threading through; an optional `request`
// arg is accepted only for call-site symmetry with the spec.
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
	getCookies,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";
import { supabaseAnonKey, supabaseUrl } from "./client";

/**
 * Create a request-scoped server Supabase client.
 *
 * A NEW client per server render (never shared across requests). The cookie
 * adapter reads from the incoming request and writes refreshed-session cookies
 * (plus the no-cache headers the library supplies) to the outgoing response.
 *
 * @param _request optional; unused — TanStack Start resolves the active request
 *   from AsyncLocalStorage. Present for signature symmetry with `getServerClient(request)`.
 * @throws if cloud is disabled (callers must gate on `isCloudEnabled()` first).
 */
export function getServerClient(_request?: Request): SupabaseClient {
	const url = supabaseUrl();
	const anonKey = supabaseAnonKey();
	if (url === "" || anonKey === "") {
		throw new Error(
			"getServerClient() called while cloud is disabled. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY, and gate callers on isCloudEnabled().",
		);
	}

	return createServerClient(url, anonKey, {
		cookies: {
			getAll() {
				// `getCookies()` → Record<name, value>; the adapter wants {name,value}[].
				return Object.entries(getCookies()).map(([name, value]) => ({
					name,
					value: value ?? "",
				}));
			},
			setAll(cookiesToSet, headers) {
				for (const { name, value, options } of cookiesToSet) {
					setCookie(name, value, options);
				}
				// Auth responses must not be cached (one user's token served to
				// another). The library passes the required no-cache headers here.
				for (const [key, value] of Object.entries(headers)) {
					setResponseHeader(key, value);
				}
			},
		},
	});
}
