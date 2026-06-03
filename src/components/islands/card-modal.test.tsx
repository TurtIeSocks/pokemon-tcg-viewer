// card-modal.test.tsx
import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { FocusCardData } from "../../server/card-mappers";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { CardModal } from "./card-modal";

const CARD: FocusCardData = {
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://example.com/charizard.png",
	supertype: "Pokémon",
	setId: "base1",
	setName: "Base Set",
	setSeries: "Base",
	cardNumber: "4",
};

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

beforeEach(async () => {
	// Pre-seed corpus so loadCorpus() early-returns without network.
	useCorpusRuntime.setState({
		index: buildIndex([
			{
				id: "base1-4",
				name: "Charizard",
				imageUrl: "https://example.com/charizard.png",
				imageUrlSmall: "https://example.com/charizard-sm.png",
				supertype: "Pokémon",
				setId: "base1",
				number: "4",
			},
		]),
	});

	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

// Dialog renders into a portal — query document.body, not container.
function getTrack(): Element | null {
	// The track has both `w-[200%]` and `flex` classes.
	// Tailwind generates `w-\[200\%\]` as literal classname "w-[200%]"
	return document.body.querySelector('[class*="w-[200%]"]');
}

function getPanels(): NodeListOf<Element> {
	// Each panel has exactly the class "w-1/2"
	return document.body.querySelectorAll('[class*="w-1/2"]');
}

test("manage=false: card detail face is active (track has translate-x-0)", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} manage={false} />,
	);

	const track = getTrack();
	expect(track).not.toBeNull();
	expect(track?.className).toContain("translate-x-0");
	expect(track?.className).not.toContain("-translate-x-1/2");
});

test("manage=true: manager face is active (track has -translate-x-1/2)", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} manage={true} />,
	);

	const track = getTrack();
	expect(track).not.toBeNull();
	expect(track?.className).toContain("-translate-x-1/2");
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
