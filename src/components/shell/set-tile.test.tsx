// src/components/shell/set-tile.test.tsx
import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderInRouter } from "../../test-utils";
import { SetTile } from "./set-tile";

const set = {
	id: "base1",
	name: "Base",
	slug: "base",
	logo: "l.png",
	symbol: "s.png",
	total: 120,
};

test("shows owned/total stat + percent when ownedCount provided", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} ownedCount={3} />);
	expect(screen.getByText("3/120")).toBeDefined();
	expect(screen.getByText(/% complete/i)).toBeDefined();
});

test("stat is bold tabular-nums (legible hero number)", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} ownedCount={3} />);
	const stat = screen.getByText("3/120");
	expect(stat.className).toContain("font-bold");
	expect(stat.className).toContain("tabular-nums");
});

test("no stat when ownedCount omitted (browse mode)", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} />);
	expect(screen.queryByText(/\/120/)).toBeNull();
	expect(screen.queryByText(/% complete/i)).toBeNull();
});

test("renders the crisp logo with the set name as alt + object-contain", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} ownedCount={3} />);
	const logo = screen.getByAltText("Base") as HTMLImageElement;
	expect(logo.src).toContain("l.png");
	expect(logo.className).toContain("object-contain");
});

test("renders a completion ring (svg) when ownedCount provided", async () => {
	const { container } = await renderInRouter(
		<SetTile seriesSlug="base" set={set} ownedCount={3} />,
	);
	expect(container.querySelector("svg")).not.toBeNull();
});

test("root link is a rounded glass tile with an accessible label", async () => {
	const { container } = await renderInRouter(
		<SetTile seriesSlug="base" set={set} ownedCount={3} />,
	);
	const link = container.querySelector("a") as HTMLAnchorElement;
	expect(link).not.toBeNull();
	expect(link.className).toContain("rounded-2xl");
	expect(link.getAttribute("aria-label")).toBe("Browse Base");
});

test("vaultLink routes to the vault per-set page", async () => {
	const { container } = await renderInRouter(
		<SetTile seriesSlug="base" set={set} ownedCount={3} vaultLink />,
	);
	const link = container.querySelector("a") as HTMLAnchorElement;
	expect(link.getAttribute("aria-label")).toBe("View vault for Base");
});
