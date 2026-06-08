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
