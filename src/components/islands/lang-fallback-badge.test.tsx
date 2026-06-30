import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { LangFallbackBadge } from "./lang-fallback-badge";

test("renders an EN badge when show is true", () => {
	render(<LangFallbackBadge show />);
	// getByText throws if the element is absent -- that IS the assertion
	screen.getByText("EN");
});

test("renders nothing when show is false", () => {
	const { container } = render(<LangFallbackBadge show={false} />);
	expect(container.textContent).toBe("");
});
