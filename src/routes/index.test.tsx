import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { HomeHero } from "./index";

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("HomeHero renders the title and a search input", async () => {
	await renderInRouter(<HomeHero />);
	expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
		"Holo Playground",
	);
	expect(
		screen.getByRole("searchbox", { name: /search cards/i }),
	).toBeDefined();
});
