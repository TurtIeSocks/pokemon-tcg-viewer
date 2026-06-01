import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { useRecentsStore } from "../../store/recents";
import { HomeRecents } from "./home-recents";

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

beforeEach(() => {
	useRecentsStore.setState({ recentSearches: [], recentlyViewed: [] });
});

test("HomeRecents renders nothing when there are no recents", async () => {
	const { container } = await renderInRouter(<HomeRecents />);
	// Empty store → no sections. Component must not throw and renders empty.
	expect(container.querySelectorAll("section").length).toBe(0);
});
