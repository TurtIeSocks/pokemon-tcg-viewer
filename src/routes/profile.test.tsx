// src/routes/profile.test.tsx
import { expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import type { NavTree } from "../lib/nav-tree";
import { useUserland } from "../store/userland/userland-store";
import {
	makeStack,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../test-utils";
import { ProfilePageInner } from "./profile";

const tree: NavTree = [
	{
		name: "Base",
		slug: "base",
		year: 1999,
		sets: [
			{
				id: "base1",
				name: "Base Set",
				slug: "base-set",
				logo: "l",
				symbol: "y",
				total: 102,
			},
		],
	},
];

test("renders the display name and the collector stats", async () => {
	const repos = await setupUserlandTest();
	await repos.profile.save({ displayName: "Ash Ketchum" });
	seedCorpus([]);
	await renderInRouter(<ProfilePageInner tree={tree} />);
	await waitFor(() => {
		expect(screen.getByText("Ash Ketchum")).toBeDefined();
	});
	expect(screen.getByText(/cards owned/i)).toBeDefined();
});

test("falls back to Collector when no profile is saved", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	await renderInRouter(<ProfilePageInner tree={tree} />);
	await waitFor(() => {
		expect(screen.getAllByText(/collector/i).length).toBeGreaterThan(0);
	});
});

test("cost basis renders in the stacks' shared currency, not hardcoded USD", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	useUserland.setState({
		items: {
			a: makeStack({ id: "a", pricePaid: 350, currency: "JPY", quantity: 1 }),
			b: makeStack({ id: "b", pricePaid: 350, currency: "JPY", quantity: 1 }),
		},
	});
	await renderInRouter(<ProfilePageInner tree={tree} />);
	await waitFor(() => {
		expect(screen.getByText("¥700")).toBeDefined();
	});
	expect(screen.queryByText("$7")).toBeNull();
});

test("cost basis renders a dash (not a wrong dollar total) when priced stacks span multiple currencies", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	useUserland.setState({
		items: {
			a: makeStack({ id: "a", pricePaid: 500, currency: "USD", quantity: 1 }),
			b: makeStack({ id: "b", pricePaid: 350, currency: "JPY", quantity: 1 }),
		},
	});
	await renderInRouter(<ProfilePageInner tree={tree} />);
	await waitFor(() => {
		expect(screen.getByTitle(/mixed currencies/i)).toBeDefined();
	});
});
