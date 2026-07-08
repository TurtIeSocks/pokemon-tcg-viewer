import { createServerFn } from "@tanstack/react-start";
import { getCookies } from "@tanstack/react-start/server";
import {
	parseSidebarState,
	SIDEBAR_COOKIE_NAME,
} from "../components/ui/sidebar-cookie";

// Server-only: holds the createServerFn handler that reads the `sidebar_state`
// cookie off the incoming request (via TanStack Start's ambient AsyncLocalStorage
// request context — same plumbing as src/lib/supabase/server.ts). The pure
// parse rules live in ../components/ui/sidebar-cookie so the client can share
// them without importing this server-only module (a server fn must never share a
// module the client imports, per the getNavTreeFn note).

/**
 * Read the persisted sidebar drawer state from the request cookies, SSR-side.
 * Absent/invalid cookie → `true` (drawer defaults to open). Only ever invoked
 * in-process during SSR — the client reads `document.cookie` directly for
 * hydration parity, so this never becomes a per-navigation RPC.
 */
export const getSidebarStateFn = createServerFn({ method: "GET" }).handler(
	(): boolean => parseSidebarState(getCookies()[SIDEBAR_COOKIE_NAME]),
);
