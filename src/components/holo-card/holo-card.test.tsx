import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { HoloCard } from "./holo-card";

const baseProps = {
	imageUrl: "https://example.invalid/charizard.png",
	name: "Charizard",
	setId: "base1",
	cardNumber: "4",
};

describe("<HoloCard />", () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		warnSpy.mockRestore();
	});

	test("renders the card image and labels the button by name", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const img = container.querySelector(".holo-card-image") as HTMLImageElement;
		expect(img.src).toBe("https://example.invalid/charizard.png");
		expect(img.alt).toBe("");
		const button = screen.getByRole("button", { name: "Charizard" });
		expect(button).toBeDefined();
	});

	test("applies known rarity class without warning", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Rare Holo VMAX" />,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("holo-vmax")).toBe(true);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("applies generic holo class and warns for unknown rarity", () => {
		const { container } = render(
			<HoloCard {...baseProps} rarity="Mythic Cosmic Tier" />,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("holo-basic")).toBe(true);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	test("applies no-foil class when rarity is missing", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("no-foil")).toBe(true);
	});

	test("calls onClick when the card is clicked", () => {
		let clicks = 0;
		render(<HoloCard {...baseProps} onClick={() => clicks++} />);
		fireEvent.click(screen.getByRole("button"));
		expect(clicks).toBe(1);
	});

	test("renders hoverOverlay content into the overlay slot", () => {
		render(
			<HoloCard
				{...baseProps}
				hoverOverlay={<button type="button">Action</button>}
			/>,
		);
		const action = screen.getByText("Action");
		expect(action.closest(".holo-card-overlay")).not.toBeNull();
	});

	test("emits data-rarity / data-subtypes / data-supertype for foil clip targeting", () => {
		const { container } = render(
			<HoloCard
				{...baseProps}
				rarity="Rare Holo"
				subtypes={["Stage 2"]}
				supertype="Pokémon"
			/>,
		);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.getAttribute("data-rarity")).toBe("rare holo");
		expect(root.getAttribute("data-subtypes")).toBe("stage 2");
		expect(root.getAttribute("data-supertype")).toBe("pokémon");
	});

	test("applies size variant class", () => {
		const { container } = render(<HoloCard {...baseProps} size="focus" />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("size-focus")).toBe(true);
	});

	test("default size is 'grid'", () => {
		const { container } = render(<HoloCard {...baseProps} />);
		const root = container.querySelector(".holo-card") as HTMLElement;
		expect(root.classList.contains("size-grid")).toBe(true);
	});
});
