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
	total: 120,
};

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("shows owned/total badge when ownedCount provided", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} ownedCount={3} />);
	expect(screen.getByText("3/120")).toBeDefined();
});

test("no badge when ownedCount omitted", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} />);
	expect(screen.queryByText(/\/120/)).toBeNull();
});

test("logo img has max-w-full and object-contain classes", async () => {
	const { container } = await renderInRouter(
		<SetTile seriesSlug="base" set={set} ownedCount={3} />,
	);
	const logo = container.querySelector(
		"img.booster-pack-logo",
	) as HTMLImageElement;
	expect(logo).not.toBeNull();
	expect(logo.className).toContain("max-w-full");
	expect(logo.className).toContain("object-contain");
});

test("root link has w-full max-w-full classes", async () => {
	const { container } = await renderInRouter(
		<SetTile seriesSlug="base" set={set} ownedCount={3} />,
	);
	const link = container.querySelector("a.booster-pack") as HTMLAnchorElement;
	expect(link).not.toBeNull();
	expect(link.className).toContain("w-full");
	expect(link.className).toContain("max-w-full");
});

test("badge count uses large bold tabular-nums styling", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} ownedCount={3} />);
	const badge = screen.getByText("3/120");
	expect(badge.className).toContain("text-3xl");
	expect(badge.className).toContain("font-bold");
	expect(badge.className).toContain("tabular-nums");
});
