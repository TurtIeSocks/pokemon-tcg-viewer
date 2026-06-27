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
	setName: "Base Set",
	cardNumber: "4",
	attacks: [
		{ name: "Fire Spin", cost: ["Fire"], damage: "100", text: "Discard 2." },
	],
});

beforeEach(async () => {
	seedCorpusFor(CARD);
	await setupUserlandTest();
});

test("renders the cockpit with a tablist", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="details" />,
	);
	expect(screen.getByRole("tablist")).toBeDefined();
	expect(
		screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected"),
	).toBe("true");
});

test("tab='details' shows the Details body", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="details" />,
	);
	expect(screen.getByText("Fire Spin")).toBeDefined();
});

test("tab='pricing' shows the pricing pane", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="pricing" />,
	);
	expect(screen.getByText(/market prices/i)).toBeDefined();
	expect(screen.queryByText("Fire Spin")).toBeNull();
});
