import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MatchModeToggle } from "./match-mode-toggle";

test("MatchModeToggle: value=false marks Fuzzy active, Exact inactive", () => {
	render(<MatchModeToggle value={false} onChange={() => {}} />);
	expect(
		screen.getByRole("button", { name: "Fuzzy" }).getAttribute("aria-pressed"),
	).toBe("true");
	expect(
		screen.getByRole("button", { name: "Exact" }).getAttribute("aria-pressed"),
	).toBe("false");
});

test("MatchModeToggle: value=true marks Exact active", () => {
	render(<MatchModeToggle value={true} onChange={() => {}} />);
	expect(
		screen.getByRole("button", { name: "Exact" }).getAttribute("aria-pressed"),
	).toBe("true");
});

test("MatchModeToggle: clicking Exact fires onChange(true)", () => {
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

test("MatchModeToggle: clicking Fuzzy fires onChange(false)", () => {
	let got: boolean | undefined;
	render(
		<MatchModeToggle
			value={true}
			onChange={(e) => {
				got = e;
			}}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Fuzzy" }));
	expect(got).toBe(false);
});
