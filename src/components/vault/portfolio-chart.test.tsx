import { afterEach, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { resetSnapshotsForTests } from "@/store/userland/idb-repo";
import { captureSnapshot, useUserland } from "@/store/userland/userland-store";
import { setupUserlandTest } from "@/test-utils";
import { PortfolioChart } from "./portfolio-chart";

afterEach(async () => {
	await resetSnapshotsForTests();
});

async function seedSnaps() {
	await setupUserlandTest();
	await captureSnapshot({
		priceDate: "2026-07-01",
		totalCents: 100000,
		currency: "USD",
		cardCount: 5,
	});
	await captureSnapshot({
		priceDate: "2026-07-02",
		totalCents: 120000,
		currency: "USD",
		cardCount: 5,
	});
	await captureSnapshot({
		priceDate: "2026-07-03",
		totalCents: 115000,
		currency: "USD",
		cardCount: 5,
	});
}

test("renders a spark-line for >=2 snapshots", async () => {
	await seedSnaps();
	const { container } = render(<PortfolioChart />);
	expect(container.querySelector("polyline")).not.toBeNull();
});

test("shows a 'builds daily' note for <2 snapshots", async () => {
	await setupUserlandTest();
	await captureSnapshot({
		priceDate: "2026-07-03",
		totalCents: 100000,
		currency: "USD",
		cardCount: 5,
	});
	const { container, getByText } = render(<PortfolioChart />);
	expect(container.querySelector("polyline")).toBeNull();
	expect(getByText(/builds daily/i)).toBeTruthy();
});

test("masks the chart when hideValue is set", async () => {
	await seedSnaps();
	useUserland.setState({
		profile: { ...useUserland.getState().profile, hideValue: true } as never,
	});
	const { container, getByText } = render(<PortfolioChart />);
	expect(container.querySelector("polyline")).toBeNull();
	expect(getByText("•••")).toBeTruthy();
});
