import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Home } from "./home";

function renderHome() {
	const router = createMemoryRouter([{ path: "/", element: <Home /> }], {
		initialEntries: ["/"],
	});
	render(<RouterProvider router={router} />);
	return router;
}

test("Home renders the hero title and popular chips", () => {
	renderHome();
	expect(screen.getByText("Pokémon TCG Holo Playground")).toBeDefined();
	expect(screen.getByRole("button", { name: "Pikachu" })).toBeDefined();
});

test("clicking a popular chip sets the q param", () => {
	const router = renderHome();
	fireEvent.click(screen.getByRole("button", { name: "Charizard" }));
	expect(router.state.location.search).toContain("q=Charizard");
});
