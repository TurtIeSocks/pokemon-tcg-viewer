import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import App from "./app";

test("App mounts without throwing", () => {
	expect(() =>
		render(
			<MemoryRouter>
				<App />
			</MemoryRouter>,
		),
	).not.toThrow();
});

test("App renders the primary nav", () => {
	const { getByText } = render(
		<MemoryRouter>
			<App />
		</MemoryRouter>,
	);
	expect(getByText("By Set")).toBeDefined();
	expect(getByText("By Pokémon")).toBeDefined();
});
