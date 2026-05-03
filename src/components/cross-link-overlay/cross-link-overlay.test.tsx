import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { CrossLinkOverlay } from "./cross-link-overlay";

function renderInRouter(ui: React.ReactElement) {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("<CrossLinkOverlay />", () => {
	test("renders nothing when given an empty links array", () => {
		const { container } = renderInRouter(<CrossLinkOverlay links={[]} />);
		expect(container.firstChild).toBeNull();
	});

	test("renders a single link with correct label and href", () => {
		renderInRouter(
			<CrossLinkOverlay
				links={[{ label: "View all Pikachu", to: "/pokemon?dex=25" }]}
			/>,
		);
		const link = screen.getByRole("link", { name: /pikachu/i });
		expect(link.getAttribute("href")).toBe("/pokemon?dex=25");
	});

	test("renders multiple stacked links for multi-Pokémon cards", () => {
		renderInRouter(
			<CrossLinkOverlay
				links={[
					{ label: "View all Pikachu", to: "/pokemon?dex=25" },
					{ label: "View all Zekrom", to: "/pokemon?dex=644" },
				]}
			/>,
		);
		expect(screen.getByRole("link", { name: /pikachu/i })).toBeDefined();
		expect(screen.getByRole("link", { name: /zekrom/i })).toBeDefined();
	});

	test("each link is keyboard-focusable", () => {
		renderInRouter(
			<CrossLinkOverlay
				links={[{ label: "Go to Crown Zenith", to: "/?setId=swsh12pt5" }]}
			/>,
		);
		const link = screen.getByRole("link");
		expect(link.getAttribute("href")).toBe("/?setId=swsh12pt5");
		// react-router <Link> renders an <a> with href; default tabIndex is 0
		// for anchor elements with href, so explicit tabIndex isn't needed.
		expect(link.tagName).toBe("A");
	});
});
