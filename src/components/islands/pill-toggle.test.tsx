import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { PillToggle } from "./pill-toggle";

test("PillToggle: renders label as a button", () => {
	render(<PillToggle value={false} onChange={() => {}} label="Exact" />);
	expect(screen.getByRole("button", { name: "Exact" })).toBeTruthy();
});

test("PillToggle: value=false → aria-pressed=false", () => {
	render(<PillToggle value={false} onChange={() => {}} label="Exact" />);
	expect(
		screen.getByRole("button", { name: "Exact" }).getAttribute("aria-pressed"),
	).toBe("false");
});

test("PillToggle: value=true → aria-pressed=true", () => {
	render(<PillToggle value={true} onChange={() => {}} label="Exact" />);
	expect(
		screen.getByRole("button", { name: "Exact" }).getAttribute("aria-pressed"),
	).toBe("true");
});

test("PillToggle: clicking when value=false fires onChange with true", () => {
	let got: boolean | undefined;
	render(
		<PillToggle
			value={false}
			onChange={(next) => {
				got = next;
			}}
			label="Exact"
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Exact" }));
	expect(got).toBe(true);
});

test("PillToggle: disabled click does NOT call onChange", () => {
	let called = false;
	render(
		<PillToggle
			value={false}
			onChange={() => {
				called = true;
			}}
			label="Exact"
			disabled
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Exact" }));
	expect(called).toBe(false);
});

test("PillToggle: renders a leading icon without changing the accessible name", () => {
	render(
		<PillToggle
			value={false}
			onChange={() => {}}
			label="Exact"
			icon={<svg data-testid="pill-icon" aria-hidden="true" />}
		/>,
	);
	expect(screen.getByTestId("pill-icon")).toBeTruthy();
	expect(screen.getByRole("button", { name: "Exact" })).toBeTruthy();
});
