import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderInRouter } from "../test-utils";
import { HomeHero } from "./index";

test("HomeHero renders the title and a search input", async () => {
	await renderInRouter(<HomeHero />);
	expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
		"Holo Playground",
	);
	expect(
		screen.getByRole("searchbox", { name: /search cards/i }),
	).toBeDefined();
});
