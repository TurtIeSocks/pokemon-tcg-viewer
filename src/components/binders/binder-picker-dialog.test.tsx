import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { Binder } from "../../store/userland/types";
import {
	addCardsToBinder,
	createBinder,
	useUserland,
} from "../../store/userland/userland-store";
import {
	makeCorpusCard,
	renderInRouter,
	setupUserlandTest,
} from "../../test-utils";
import { BinderPickerDialog } from "./binder-picker-dialog";

const CARD_ID = "base1-1";

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

/** Seed corpus + region index + sets so useBindersForCard (region-aware) resolves. */
function seedRegions(): void {
	const index = buildIndex([
		makeCorpusCard({
			id: CARD_ID,
			name: "Bulbasaur",
			setId: "base1",
			number: "1",
		}),
	]);
	useCorpusRuntime.setState({ index, indices: { west: index } });
	useStore.setState({ sets: [testSet] });
}

beforeEach(async () => {
	await setupUserlandTest();
	seedRegions();
});

describe("<BinderPickerDialog /> — add-only (default) mode", () => {
	test("lists binders as buttons; clicking one calls onPick and closes", async () => {
		const onPick = mock(() => {});
		const onOpenChange = mock(() => {});
		const binders: Binder[] = [
			{
				id: "b1",
				name: "Chase Binder",
				description: null,
				rules: [],
				includeCardIds: [],
				excludeCardIds: [],
				createdAt: 0,
				updatedAt: 0,
				deletedAt: null,
			},
		];
		await renderInRouter(
			<BinderPickerDialog
				open
				onOpenChange={onOpenChange}
				title="Add 3 cards to a binder"
				binders={binders}
				onPick={onPick}
				onCreateNew={() => {}}
			/>,
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Chase Binder" }),
		);
		expect(onPick).toHaveBeenCalledWith("b1");
		expect(onOpenChange).toHaveBeenCalledWith(false);
		// No checkboxes in add-only mode.
		expect(screen.queryByRole("checkbox")).toBeNull();
	});
});

describe("<BinderPickerDialog /> — membership mode", () => {
	test("a checkbox per binder reflects current membership", async () => {
		const memberBinder = await createBinder({ name: "Has Card" });
		await addCardsToBinder(memberBinder.id, [CARD_ID]);
		const emptyBinder = await createBinder({ name: "No Card" });

		renderInRouter(
			<BinderPickerDialog
				open
				onOpenChange={() => {}}
				title="Manage binders"
				binders={[memberBinder, emptyBinder]}
				membershipCardId={CARD_ID}
				onPick={() => {}}
				onCreateNew={() => {}}
			/>,
		);

		const memberBox = await screen.findByRole("checkbox", { name: "Has Card" });
		const emptyBox = screen.getByRole("checkbox", { name: "No Card" });
		await waitFor(() =>
			expect(memberBox.getAttribute("aria-checked")).toBe("true"),
		);
		expect(emptyBox.getAttribute("aria-checked")).toBe("false");
	});

	test("toggling a box ON adds the card (box becomes checked)", async () => {
		const binder = await createBinder({ name: "Target" });

		renderInRouter(
			<BinderPickerDialog
				open
				onOpenChange={() => {}}
				title="Manage binders"
				binders={[binder]}
				membershipCardId={CARD_ID}
				onPick={() => {}}
				onCreateNew={() => {}}
			/>,
		);

		const box = await screen.findByRole("checkbox", { name: "Target" });
		expect(box.getAttribute("aria-checked")).toBe("false");
		fireEvent.click(box);

		await waitFor(() =>
			expect(
				useUserland.getState().binders[binder.id]?.includeCardIds,
			).toContain(CARD_ID),
		);
		await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
	});

	test("toggling a box OFF removes the card (box becomes unchecked)", async () => {
		const binder = await createBinder({ name: "Source" });
		await addCardsToBinder(binder.id, [CARD_ID]);

		renderInRouter(
			<BinderPickerDialog
				open
				onOpenChange={() => {}}
				title="Manage binders"
				binders={[binder]}
				membershipCardId={CARD_ID}
				onPick={() => {}}
				onCreateNew={() => {}}
			/>,
		);

		const box = await screen.findByRole("checkbox", { name: "Source" });
		await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("true"));
		fireEvent.click(box);

		await waitFor(() =>
			expect(
				useUserland.getState().binders[binder.id]?.excludeCardIds,
			).toContain(CARD_ID),
		);
		await waitFor(() => expect(box.getAttribute("aria-checked")).toBe("false"));
	});

	test("still offers the create-new escape hatch", async () => {
		await createBinder({ name: "Existing" });
		const onCreateNew = mock(() => {});
		renderInRouter(
			<BinderPickerDialog
				open
				onOpenChange={() => {}}
				title="Manage binders"
				binders={Object.values(useUserland.getState().binders)}
				membershipCardId={CARD_ID}
				onPick={() => {}}
				onCreateNew={onCreateNew}
			/>,
		);
		fireEvent.click(await screen.findByRole("button", { name: /new binder/i }));
		expect(onCreateNew).toHaveBeenCalled();
	});
});
