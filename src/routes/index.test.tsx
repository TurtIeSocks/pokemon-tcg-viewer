import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HomePlaceholder } from "./index";

test("HomePlaceholder renders the scaffold heading", () => {
	render(<HomePlaceholder />);
	expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
		"Holo Playground",
	);
	expect(screen.getByText("SSR scaffold is live.")).toBeDefined();
});
