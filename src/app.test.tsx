import { expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { RootLayout } from "./root-layout";

function makeRouter() {
	return createMemoryRouter([
		{
			path: "/",
			element: <RootLayout />,
		},
	]);
}

test("RootLayout mounts without throwing", () => {
	expect(() => render(<RouterProvider router={makeRouter()} />)).not.toThrow();
});

test("RootLayout renders the toolbar", async () => {
	render(<RouterProvider router={makeRouter()} />);
	await waitFor(() => {
		expect(screen.getByText("Collection")).toBeDefined();
	});
	expect(screen.getByText("Pokémon TCG Holo Playground")).toBeDefined();
});
