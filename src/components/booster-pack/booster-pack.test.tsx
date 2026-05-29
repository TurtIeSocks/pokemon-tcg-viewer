import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PokemonSet } from "../../api";
import { BoosterPack } from "./booster-pack";

const set: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 102,
	images: {
		symbol: "https://example.invalid/symbol.png",
		logo: "https://example.invalid/logo.png",
	},
};

describe("<BoosterPack />", () => {
	test("renders the set name and Rip to open label", () => {
		render(<BoosterPack set={set} ripped={false} onRip={() => {}} />);
		expect(screen.getByText(/Base/)).toBeDefined();
		expect(screen.getByText(/rip to open/i)).toBeDefined();
	});

	test("click fires onRip", () => {
		let calls = 0;
		render(<BoosterPack set={set} ripped={false} onRip={() => calls++} />);
		fireEvent.click(screen.getByRole("button", { name: /open .* booster/i }));
		expect(calls).toBe(1);
	});
});
