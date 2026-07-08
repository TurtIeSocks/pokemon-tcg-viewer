import { afterEach, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { CollectionStats } from "@/store/userland/stats";
import { useUserland } from "@/store/userland/userland-store";
import { setupUserlandTest } from "@/test-utils";
import { ValueStats } from "./value-stats";

// ValueStats reads useCollectionStats; to test the render logic in isolation,
// pass the stats in as a prop. Refactor <ValueStats> to accept an optional
// `stats` prop (defaults to useCollectionStats()) so tests inject values
// without seeding the whole prices+userland chain. (If you prefer to seed the
// stores instead, do that consistently — but the prop injection keeps this test
// focused on the DISPLAY logic, which is the point of extracting the component.)
const base: CollectionStats = {
	cardsOwned: 0,
	setsTouched: 0,
	completionPct: 0,
	thisWeek: 0,
	collectingSince: null,
	estValue: null,
	estValueCurrency: null,
	marketValue: null,
	costBasisConverted: null,
	unrealizedPnL: null,
	valueCurrency: "USD",
};

afterEach(async () => {
	await setupUserlandTest();
});

test("renders market value, cost basis, and signed P&L", async () => {
	await setupUserlandTest();
	const { getByText } = render(
		<ValueStats
			stats={{
				...base,
				marketValue: 200000,
				costBasisConverted: 80000,
				unrealizedPnL: 120000,
				valueCurrency: "USD",
			}}
		/>,
	);
	expect(getByText("$2000.00")).toBeTruthy(); // market value
	expect(getByText("$800.00")).toBeTruthy(); // cost basis
	expect(getByText("+$1200.00")).toBeTruthy(); // P&L
});

test("negative P&L renders with the down tone", async () => {
	await setupUserlandTest();
	const { getByText } = render(
		<ValueStats
			stats={{
				...base,
				marketValue: 5000,
				costBasisConverted: 8000,
				unrealizedPnL: -3000,
			}}
		/>,
	);
	expect(getByText("-$30.00").className).toContain("text-(--danger)");
});

test("market value shows — when prices unavailable", async () => {
	await setupUserlandTest();
	const { getAllByText } = render(<ValueStats stats={base} />);
	expect(getAllByText("—").length).toBeGreaterThanOrEqual(1);
});

test("hideValue masks every money value", async () => {
	await setupUserlandTest();
	useUserland.setState({
		profile: { ...useUserland.getState().profile, hideValue: true } as never,
	});
	const { getAllByText, queryByText } = render(
		<ValueStats
			stats={{
				...base,
				marketValue: 200000,
				costBasisConverted: 80000,
				unrealizedPnL: 120000,
			}}
		/>,
	);
	expect(getAllByText("•••").length).toBeGreaterThanOrEqual(2);
	expect(queryByText("$2000.00")).toBeNull();
});
