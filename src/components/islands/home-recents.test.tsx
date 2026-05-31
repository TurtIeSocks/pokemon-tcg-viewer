import { render } from "@testing-library/react";
import { expect, test } from "bun:test";
import { HomeRecents } from "./home-recents";

test("HomeRecents renders nothing when there are no recents", () => {
	const { container } = render(<HomeRecents />);
	// Empty store → no sections. Component must not throw and renders empty.
	expect(container.querySelectorAll("section").length).toBe(0);
});
