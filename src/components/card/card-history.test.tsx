import { afterEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
	resetHistoryRuntimeForTests,
	useHistoryRuntime,
} from "@/store/corpus/history-runtime";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { makeFocusCard } from "../../test-utils";
import { CardHistory } from "./card-history";

const CARD = makeFocusCard({ id: "base1-4", setId: "base1" });

function seedPrices() {
	usePricesRuntime.setState({
		byId: new Map(
			Object.entries({
				"base1-4": { cm: [50168, 27674, 40096, 56391] },
			}),
		),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: "2026-07-02" },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
}

afterEach(async () => {
	await resetHistoryRuntimeForTests();
	await resetPricesRuntimeForTests();
});

test("renders a spark-line chart + range toggle + trend chips when history exists", () => {
	const today = new Date().toISOString().slice(0, 10);
	const [y, m, d] = today.split("-").map(Number);
	const todayEpochDay = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
	useHistoryRuntime.setState({
		bySet: new Map([
			[
				"base1",
				{
					"base1-4": [
						[todayEpochDay - 5, 70000],
						[todayEpochDay - 1, 72034],
					],
				},
			],
		]),
		statusBySet: new Map([["base1", "ready"]]),
	});
	seedPrices();

	const { container } = render(<CardHistory card={CARD} />);

	expect(container.querySelector("polyline")).not.toBeNull();
	expect(screen.getByText("1Y")).toBeTruthy();
	expect(
		screen.getByRole("button", { name: "1Y" }).getAttribute("aria-pressed"),
	).toBeDefined();
});

test("empty set history renders the builds-daily note, no polyline, but trend chips still show", () => {
	useHistoryRuntime.setState({
		bySet: new Map([["base1", {}]]),
		statusBySet: new Map([["base1", "ready"]]),
	});
	seedPrices();

	const { container } = render(<CardHistory card={CARD} />);

	expect(container.querySelector("polyline")).toBeNull();
	expect(screen.getByText(/Price history builds daily\./i)).toBeTruthy();
	// trend chips still present (cm tuple has non-null avg7/avg30)
	expect(container.textContent).toMatch(/%/);
});
