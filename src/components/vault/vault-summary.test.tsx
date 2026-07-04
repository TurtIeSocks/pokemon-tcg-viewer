import { afterEach, beforeEach, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { resetPricesRuntimeForTests } from "@/store/corpus/prices-runtime";
import { useUserland } from "@/store/userland/userland-store";
import { renderInRouter, setupUserlandTest } from "@/test-utils";
import { VaultSummaryHero } from "./vault-summary";

beforeEach(async () => {
	await setupUserlandTest();
});

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

test("clicking the hide-toggle button flips profile.hideValue", async () => {
	await renderInRouter(<VaultSummaryHero />);

	const hideButton = screen.getByRole("button", { name: /hide values/i });
	fireEvent.click(hideButton);
	await waitFor(() => {
		expect(useUserland.getState().profile?.hideValue).toBe(true);
	});

	const showButton = await screen.findByRole("button", {
		name: /show values/i,
	});
	fireEvent.click(showButton);
	await waitFor(() => {
		expect(useUserland.getState().profile?.hideValue).toBe(false);
	});
});
