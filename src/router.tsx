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
		// Show a route's pendingComponent quickly once a loader is actually running
		// (so an old list doesn't linger on navigation), but hold it long enough to
		// avoid a flash on near-instant loads. Cached revisits skip the loader
		// entirely (defaultStaleTime), so no skeleton there.
		defaultPendingMs: 150,
		defaultPendingMinMs: 400,
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
