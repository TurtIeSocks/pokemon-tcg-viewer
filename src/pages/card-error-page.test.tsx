import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { CardErrorPage } from "./card-error-page";

function renderWithError(thrown: unknown) {
	const router = createMemoryRouter(
		[
			{
				path: "/card/:id",
				element: <div>card</div>,
				loader: () => {
					throw thrown;
				},
				errorElement: <CardErrorPage />,
			},
		],
		{ initialEntries: ["/card/test"] },
	);
	return render(<RouterProvider router={router} />);
}

describe("<CardErrorPage />", () => {
	test("renders 404 message when error is a Response with 404 status", async () => {
		renderWithError(new Response("not found", { status: 404 }));
		await waitFor(() => {
			expect(screen.getByText(/Card not found/i)).toBeDefined();
		});
		expect(screen.getByText(/couldn't find that card/i)).toBeDefined();
	});

	test("renders generic message for non-404 errors", async () => {
		renderWithError(new Error("network down"));
		await waitFor(() => {
			expect(screen.getByText(/Something went wrong/i)).toBeDefined();
		});
	});

	test("includes a Back home link", async () => {
		renderWithError(new Response("not found", { status: 404 }));
		await waitFor(() => {
			expect(screen.getByRole("link", { name: /back home/i })).toBeDefined();
		});
		const link = screen.getByRole("link", { name: /back home/i });
		expect(link.getAttribute("href")).toBe("/");
	});
});
