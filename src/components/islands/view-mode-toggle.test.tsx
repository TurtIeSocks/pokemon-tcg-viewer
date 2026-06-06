import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ViewModeToggle } from "./view-mode-toggle";

test('ViewModeToggle: value="grid" → Timeline pill aria-pressed=false', () => {
	render(<ViewModeToggle value="grid" onChange={() => {}} disabled={false} />);
	expect(
		screen
			.getByRole("button", { name: "Timeline" })
			.getAttribute("aria-pressed"),
	).toBe("false");
});

test('ViewModeToggle: value="timeline" → Timeline pill aria-pressed=true', () => {
	render(
		<ViewModeToggle value="timeline" onChange={() => {}} disabled={false} />,
	);
	expect(
		screen
			.getByRole("button", { name: "Timeline" })
			.getAttribute("aria-pressed"),
	).toBe("true");
});

test('ViewModeToggle: clicking Timeline when value="grid" fires onChange("timeline")', () => {
	let got: string | undefined;
	render(
		<ViewModeToggle
			value="grid"
			onChange={(e) => {
				got = e;
			}}
			disabled={false}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
	expect(got).toBe("timeline");
});

test('ViewModeToggle: clicking Timeline when value="timeline" fires onChange("grid")', () => {
	let got: string | undefined;
	render(
		<ViewModeToggle
			value="timeline"
			onChange={(e) => {
				got = e;
			}}
			disabled={false}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
	expect(got).toBe("grid");
});
