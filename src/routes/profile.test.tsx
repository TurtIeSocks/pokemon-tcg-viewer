// src/routes/profile.test.tsx
import { expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import type { NavTree } from "../lib/nav-tree";
import { renderInRouter, seedCorpus, setupUserlandTest } from "../test-utils";
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
