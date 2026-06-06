import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MatchModeToggle } from "./match-mode-toggle";

test("MatchModeToggle: value=false (fuzzy) → Exact pill aria-pressed=false", () => {
	render(<MatchModeToggle value={false} onChange={() => {}} />);
	expect(
		screen.getByRole("button", { name: "Exact" }).getAttribute("aria-pressed"),
	).toBe("false");
});

test("MatchModeToggle: value=true (exact) → Exact pill aria-pressed=true", () => {
	render(<MatchModeToggle value={true} onChange={() => {}} />);
	expect(
		screen.getByRole("button", { name: "Exact" }).getAttribute("aria-pressed"),
	).toBe("true");
});

test("MatchModeToggle: clicking Exact when value=false fires onChange(true)", () => {
	let got: boolean | undefined;
	render(
		<MatchModeToggle
			value={false}
			onChange={(e) => {
				got = e;
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Exact" }));
	expect(got).toBe(true);
});

test("MatchModeToggle: clicking Exact when value=true fires onChange(false)", () => {
	let got: boolean | undefined;
	render(
		<MatchModeToggle
			value={true}
			onChange={(e) => {
				got = e;
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Exact" }));
	expect(got).toBe(false);
});
