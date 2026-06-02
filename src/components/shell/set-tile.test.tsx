// src/components/shell/set-tile.test.tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { SetTile } from "./set-tile";

const set = {
	id: "base1",
	name: "Base",
	slug: "base",
	logo: "l.png",
	symbol: "s.png",
	total: 102,
};

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("shows owned/total badge when ownedCount provided", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} ownedCount={13} />);
	expect(screen.getByText("13/102")).toBeDefined();
});

test("no badge when ownedCount omitted", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} />);
	expect(screen.queryByText(/\/102/)).toBeNull();
});
