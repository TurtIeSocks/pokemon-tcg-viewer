import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardLightbox } from "./card-lightbox";

const props = {
	src: "https://images.pokemontcg.io/base1/4_hires.png",
	alt: "Charizard",
};

describe("<CardLightbox />", () => {
	test("renders nothing while closed", () => {
		const { container } = render(
			<CardLightbox open={false} onClose={() => {}} {...props} />,
		);
		expect(container.querySelector("img")).toBeNull();
	});

	test("shows the enlarged image when open", () => {
		render(<CardLightbox open onClose={() => {}} {...props} />);
		const img = screen.getByAltText("Charizard") as HTMLImageElement;
		// Served through the CDN at a large width for a crisp zoom.
		expect(img.getAttribute("src")).toContain("w=1024");
	});

	test("closes on backdrop click", () => {
		let closed = 0;
		render(<CardLightbox open onClose={() => closed++} {...props} />);
		fireEvent.click(
			screen.getByRole("button", { name: /close enlarged view of charizard/i }),
		);
		expect(closed).toBe(1);
	});

	test("closes on Escape", () => {
		let closed = 0;
		render(<CardLightbox open onClose={() => closed++} {...props} />);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(closed).toBe(1);
	});
});
