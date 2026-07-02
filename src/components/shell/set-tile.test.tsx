// src/components/shell/set-tile.test.tsx
import { expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { renderInRouter } from "../../test-utils";
import { SetTile } from "./set-tile";

/** Force an <img>'s intrinsic size (happy-dom never decodes), then fire load. */
function loadWithSize(img: HTMLImageElement, w: number, h: number): void {
	Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
	Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
	fireEvent.load(img);
}

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

test("a portrait card-back placeholder logo falls back to the set name", async () => {
	// pokemontcg.io returns the Poké Ball card back (640×892) with a 404 body; the
	// browser fires `load`, so onError can't catch it. A portrait logo is that
	// placeholder → drop it and show the set name instead.
	const cardBackSet = {
		id: "mee",
		name: "Mega Evolution Energy",
		slug: "mega-evolution-energy",
		logo: "cardback.png",
		symbol: "s.png",
		total: 10,
	};
	const { container } = await renderInRouter(
		<SetTile seriesSlug="me" set={cardBackSet} />,
	);
	const logo = screen.getByAltText("Mega Evolution Energy") as HTMLImageElement;
	loadWithSize(logo, 640, 892);

	// Logo removed; the set name is shown as the placeholder.
	expect(
		container.querySelector('img[alt="Mega Evolution Energy"]'),
	).toBeNull();
	expect(screen.getByText("Mega Evolution Energy")).toBeDefined();
});

test("a landscape logo is kept (real wordmark, not the placeholder)", async () => {
	await renderInRouter(<SetTile seriesSlug="base" set={set} />);
	const logo = screen.getByAltText("Base") as HTMLImageElement;
	loadWithSize(logo, 2500, 1281);
	// Still the image (no name fallback).
	expect(screen.getByAltText("Base")).toBeDefined();
});

test("renders a logo-less set (common for Asian sets) without crashing", async () => {
	const noLogoSet = {
		id: "sm1-jp",
		name: "コレクション",
		slug: "collection-jp",
		total: 60,
	};
	const { container } = await renderInRouter(
		<SetTile seriesSlug="jp" set={noLogoSet} ownedCount={5} />,
	);
	// No logo/symbol -> falls back to the set name as text, no crash.
	expect(screen.getByText("コレクション")).toBeDefined();
	expect(screen.getByText("5/60")).toBeDefined();
	expect(container.querySelector("img")).toBeNull();
});

test("vaultLink routes to the vault per-set page", async () => {
	const { container } = await renderInRouter(
		<SetTile seriesSlug="base" set={set} ownedCount={3} vaultLink />,
	);
	const link = container.querySelector("a") as HTMLAnchorElement;
	expect(link.getAttribute("aria-label")).toBe("View vault for Base");
});
