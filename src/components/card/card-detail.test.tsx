// card-detail.test.tsx
import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { addStack } from "../../store/userland/userland-store";
import {
	makeFocusCard,
	renderInRouter,
	seedCorpusFor,
	setupUserlandTest,
} from "../../test-utils";
import { CardDetail } from "./card-detail";

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

test("unowned card renders '＋ Add to Vault' button", async () => {
	await renderInRouter(<CardDetail card={CARD} crossLinks={[]} />);

	const addBtn = screen.getByRole("button", { name: /add to vault/i });
	expect(addBtn).not.toBeNull();

	// Should NOT show "Manage Collection"
	expect(
		screen.queryByRole("button", { name: /manage collection/i }),
	).toBeNull();
	expect(screen.queryByRole("link", { name: /manage collection/i })).toBeNull();
});

test("owned card renders 'Manage Collection' button (not 'Add to Vault')", async () => {
	// Seed a copy so the card is owned.
	await addStack("base1-4");

	await renderInRouter(<CardDetail card={CARD} crossLinks={[]} />);

	// "Manage Collection" button should be present (disabled — no onManage supplied)
	const manageEl = screen.queryByRole("button", { name: /manage collection/i });
	expect(manageEl).not.toBeNull();

	// "Add to Vault" should NOT be present
	expect(screen.queryByRole("button", { name: /add to vault/i })).toBeNull();
});

test("owned card with onManage: clicking 'Manage Collection' invokes the callback", async () => {
	await addStack("base1-4");
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
