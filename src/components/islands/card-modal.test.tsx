// card-modal.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import {
	makeFocusCard,
	renderInRouter,
	seedCorpusFor,
	setupUserlandTest,
} from "../../test-utils";
import { CardModal } from "./card-modal";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://example.com/charizard.png",
	setName: "Base Set",
	cardNumber: "4",
});

beforeEach(async () => {
	// Pre-seed corpus so loadCorpus() early-returns without network.
	seedCorpusFor(CARD);
	await setupUserlandTest();
});

// Dialog renders into a portal — query document.body, not container.
function getTrack(): Element | null {
	// The slide track is the only element carrying `transition-transform`.
	return document.body.querySelector('[class*="transition-transform"]');
}

function getPanels(): NodeListOf<Element> {
	// Each panel is a flex item with `basis-full`.
	return document.body.querySelectorAll('[class*="basis-full"]');
}

test("manage=false: card detail face is active (track has translate-x-0)", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} manage={false} />,
	);

	const track = getTrack();
	expect(track).not.toBeNull();
	expect(track?.className).toContain("translate-x-0");
	expect(track?.className).not.toContain("-translate-x-full");
});

test("manage=true: manager face is active (track has -translate-x-full)", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} manage={true} />,
	);

	const track = getTrack();
	expect(track).not.toBeNull();
	expect(track?.className).toContain("-translate-x-full");
	expect(track?.className).not.toContain("translate-x-0");
});

test("manage=true: 'Card Details' button is present and not aria-hidden", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} manage={true} />,
	);

	const backBtn = screen.getByRole("button", { name: /card details/i });
	expect(backBtn).not.toBeNull();

	// The panel containing the back button must not itself be aria-hidden
	const hiddenAncestor = backBtn.closest("[aria-hidden='true']");
	expect(hiddenAncestor).toBeNull();
});

test("manage=false: detail panel not aria-hidden; manager panel is aria-hidden", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} manage={false} />,
	);

	const panels = getPanels();
	expect(panels.length).toBeGreaterThanOrEqual(2);

	// Panel A (detail): no aria-hidden
	expect(panels[0]?.getAttribute("aria-hidden")).toBeNull();
	// Panel B (manager): aria-hidden="true"
	expect(panels[1]?.getAttribute("aria-hidden")).toBe("true");
});

test("manage=true: detail panel is aria-hidden; manager panel is not", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} manage={true} />,
	);

	const panels = getPanels();
	expect(panels.length).toBeGreaterThanOrEqual(2);

	// Panel A (detail): aria-hidden="true"
	expect(panels[0]?.getAttribute("aria-hidden")).toBe("true");
	// Panel B (manager): no aria-hidden
	expect(panels[1]?.getAttribute("aria-hidden")).toBeNull();
});
