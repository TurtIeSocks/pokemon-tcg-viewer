import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
	const mql = window.matchMedia(QUERY);
	mql.addEventListener("change", onChange);
	return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
	return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
	return false;
}

/**
 * True when the viewport is below the mobile breakpoint (768px).
 * Uses useSyncExternalStore so there's no mount-only setState (no extra render)
 * and it hydrates SSR-safe (server snapshot = false).
 */
export function useIsMobile(): boolean {
	return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
