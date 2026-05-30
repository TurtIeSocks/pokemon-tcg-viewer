import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PokemonSet } from "../../api";
import { groupSetsBySeries } from "../../utils/group-sets-by-series";
import { SeriesMenu } from "./series-menu";

function makeSet(id: string, series: string, name: string): PokemonSet {
	return {
		id,
		name,
		series,
		releaseDate: "2020/01/01",
		total: 100,
		images: { symbol: `${id}.png`, logo: `${id}-logo.png` },
	};
}

const SETS = [
	makeSet("swsh1", "Sword & Shield", "Base"),
	makeSet("swsh45", "Sword & Shield", "Shining Fate"),
	makeSet("sv1", "Scarlet & Violet", "Scarlet & Violet Base"),
];

function setup(overrides: Partial<Parameters<typeof SeriesMenu>[0]> = {}) {
	const onSelect = mock((_id: string) => {});
	render(
		<SeriesMenu
			groups={groupSetsBySeries(SETS)}
			selectedSeries="Sword & Shield"
			selectedSetId="swsh1"
			onSelect={onSelect}
			openDelay={0}
			closeDelay={0}
			{...overrides}
		/>,
	);
	return { onSelect };
}

describe("<SeriesMenu />", () => {
	afterEach(cleanup);

	it("renders one trigger per series", () => {
		setup();
		expect(
			screen.getByRole("button", { name: "Sword & Shield" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Scarlet & Violet" }),
		).toBeDefined();
	});

	it("does not reveal any sets until a series is opened", () => {
		setup();
		expect(screen.queryByRole("menu")).toBeNull();
		expect(screen.queryByText("Shining Fate")).toBeNull();
	});

	it("opens a popover with the series' sets on trigger click", () => {
		setup();
		fireEvent.click(screen.getByRole("button", { name: "Sword & Shield" }));
		expect(
			screen.getByRole("menu", { name: "Sword & Shield sets" }),
		).toBeDefined();
		expect(
			screen.getByRole("menuitem", { name: "Shining Fate" }),
		).toBeDefined();
	});

	it("fires onSelect with the set id and closes when a set is chosen", () => {
		const { onSelect } = setup();
		fireEvent.click(screen.getByRole("button", { name: "Sword & Shield" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Shining Fate" }));
		expect(onSelect).toHaveBeenCalledWith("swsh45");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("highlights the active series trigger", () => {
		setup();
		expect(
			screen.getByRole("button", { name: "Sword & Shield" }).className,
		).toContain("active");
		expect(
			screen.getByRole("button", { name: "Scarlet & Violet" }).className,
		).not.toContain("active");
	});

	it("toggles the popover closed on a second trigger click", () => {
		setup();
		const trigger = screen.getByRole("button", { name: "Sword & Shield" });
		fireEvent.click(trigger);
		expect(screen.getByRole("menu")).toBeDefined();
		fireEvent.click(trigger);
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("closes the popover on Escape", () => {
		setup();
		const trigger = screen.getByRole("button", { name: "Sword & Shield" });
		fireEvent.click(trigger);
		fireEvent.keyDown(trigger, { key: "Escape" });
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("opens a popover via ArrowDown on the trigger", () => {
		setup();
		fireEvent.keyDown(
			screen.getByRole("button", { name: "Scarlet & Violet" }),
			{
				key: "ArrowDown",
			},
		);
		expect(
			screen.getByRole("menu", { name: "Scarlet & Violet sets" }),
		).toBeDefined();
	});

	it("closes the popover on outside click", () => {
		setup();
		fireEvent.click(screen.getByRole("button", { name: "Sword & Shield" }));
		expect(screen.getByRole("menu")).toBeDefined();
		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole("menu")).toBeNull();
	});
});
