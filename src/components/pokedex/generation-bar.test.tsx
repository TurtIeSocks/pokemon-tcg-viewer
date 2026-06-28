import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PokedexRow } from "../../lib/pokedex";
import { GenerationBar } from "./generation-bar";

const rows: PokedexRow[] = [
	{ dex: 1, name: "bulbasaur", count: 5, type: "Grass" },
	{ dex: 152, name: "chikorita", count: 4, type: "Grass" },
	{ dex: 160, name: "feraligatr", count: 3, type: "Water" },
];

test("jumps to the first index of a populated generation", () => {
	const jumps: number[] = [];
	render(<GenerationBar rows={rows} onJump={(i) => jumps.push(i)} />);
	fireEvent.click(screen.getByRole("button", { name: "Gen 2" }));
	expect(jumps).toEqual([1]); // first row with dex in 152..251
});

test("disables a generation with no visible rows", () => {
	render(<GenerationBar rows={rows} onJump={() => {}} />);
	const gen3 = screen.getByRole("button", {
		name: "Gen 3",
	}) as HTMLButtonElement;
	expect(gen3.disabled).toBe(true);
});
