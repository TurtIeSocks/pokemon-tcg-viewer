import { createRouter } from "@tanstack/react-router";
import { RouteError, RouteNotFound } from "./components/shell/route-status";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		// Reuse a loader's data for 30s across navigations and for preload→click,
		// so intent-preloading a link then clicking it doesn't re-run the loader
		// (and its server-fn RPC). Card/set/nav data is effectively static.
		defaultPreloadStaleTime: 30_000,
		defaultStaleTime: 30_000,
		// Crossfade navigations via the native View Transitions API (browsers that
		// lack it just navigate instantly). Replaces the old card-back skeleton/flip:
		// old grid fades to new grid, no jarring flash. Degrades gracefully.
		defaultViewTransition: true,
		// App-wide fallbacks for `throw notFound()` and loader/component errors.
		defaultNotFoundComponent: RouteNotFound,
		defaultErrorComponent: RouteError,
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
