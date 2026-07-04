import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useUserland } from "../../store/userland/userland-store";
import { setupUserlandTest } from "../../test-utils";
import { ProfileFormDialog } from "./profile-form-dialog";

beforeEach(async () => {
	await setupUserlandTest();
});

test("submitting persists the display name via updateProfile", async () => {
	render(<ProfileFormDialog open onOpenChange={() => {}} />);
	fireEvent.change(screen.getByLabelText(/display name/i), {
		target: { value: "Ash" },
	});
	// biome-ignore lint/style/noNonNullAssertion: form always present
	fireEvent.submit(document.querySelector("form")!);
	await waitFor(() => {
		expect(useUserland.getState().profile?.displayName).toBe("Ash");
	});
});

test("empty display name shows a required error", async () => {
	render(<ProfileFormDialog open onOpenChange={() => {}} />);
	const name = screen.getByLabelText(/display name/i);
	fireEvent.change(name, { target: { value: "" } });
	fireEvent.blur(name);
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	const err = await screen.findByRole("alert");
	expect(err.textContent).toBe("Display name is required");
});

test("renders the Currency select with currency options", async () => {
	render(<ProfileFormDialog open onOpenChange={() => {}} />);
	expect(screen.getByText("Currency")).toBeTruthy();
	const currencyTrigger = document.getElementById("displayCurrency");
	if (!currencyTrigger) throw new Error("currency trigger not rendered");
	fireEvent.click(currencyTrigger);
	expect(await screen.findByRole("option", { name: /USD/ })).toBeTruthy();
	expect(screen.getByRole("option", { name: /JPY/ })).toBeTruthy();
});

test("submitting persists the chosen display currency via updateProfile", async () => {
	render(<ProfileFormDialog open onOpenChange={() => {}} />);
	fireEvent.change(screen.getByLabelText(/display name/i), {
		target: { value: "Ash" },
	});
	const currencyTrigger = document.getElementById("displayCurrency");
	if (!currencyTrigger) throw new Error("currency trigger not rendered");
	fireEvent.click(currencyTrigger);
	const jpyOption = await screen.findByRole("option", { name: /JPY/ });
	fireEvent.click(jpyOption);
	// biome-ignore lint/style/noNonNullAssertion: form always present
	fireEvent.submit(document.querySelector("form")!);
	await waitFor(() => {
		expect(useUserland.getState().profile?.displayCurrency).toBe("JPY");
	});
});

test("submitting the toggled Hide monetary values switch persists hideValue via updateProfile", async () => {
	render(<ProfileFormDialog open onOpenChange={() => {}} />);
	fireEvent.change(screen.getByLabelText(/display name/i), {
		target: { value: "Ash" },
	});
	const hideSwitch = screen.getByRole("switch", {
		name: /hide monetary values/i,
	});
	fireEvent.click(hideSwitch);
	// biome-ignore lint/style/noNonNullAssertion: form always present
	fireEvent.submit(document.querySelector("form")!);
	await waitFor(() => {
		expect(useUserland.getState().profile?.hideValue).toBe(true);
	});
});
