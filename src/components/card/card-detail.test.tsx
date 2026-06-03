// card-detail.test.tsx
import { beforeEach, expect, mock, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FocusCardData } from "../../server/card-mappers";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { CardDetail } from "./card-detail";

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

test("unowned card renders '＋ Add to collection' button", async () => {
	await renderInRouter(<CardDetail card={CARD} crossLinks={[]} />);

	const addBtn = screen.getByRole("button", { name: /add to collection/i });
	expect(addBtn).not.toBeNull();

	// Should NOT show "Manage Collection"
	expect(
		screen.queryByRole("button", { name: /manage collection/i }),
	).toBeNull();
	expect(screen.queryByRole("link", { name: /manage collection/i })).toBeNull();
});

test("owned card renders 'Manage Collection' button (not 'Add to collection')", async () => {
	// Seed a copy so the card is owned.
	await addCopy("base1-4");

	await renderInRouter(<CardDetail card={CARD} crossLinks={[]} />);

	// "Manage Collection" button should be present (disabled — no onManage supplied)
	const manageEl = screen.queryByRole("button", { name: /manage collection/i });
	expect(manageEl).not.toBeNull();

	// "Add to collection" should NOT be present
	expect(
		screen.queryByRole("button", { name: /add to collection/i }),
	).toBeNull();
});

test("owned card with onManage: clicking 'Manage Collection' invokes the callback", async () => {
	await addCopy("base1-4");
	const onManage = mock(() => {});

	await renderInRouter(
		<CardDetail card={CARD} crossLinks={[]} onManage={onManage} />,
	);

	const manageBtn = screen.getByRole("button", { name: /manage collection/i });
	expect(manageBtn).not.toBeNull();
	// Button must be enabled when onManage is supplied.
	expect((manageBtn as HTMLButtonElement).disabled).toBe(false);
	fireEvent.click(manageBtn);
	expect(onManage).toHaveBeenCalledTimes(1);
});
