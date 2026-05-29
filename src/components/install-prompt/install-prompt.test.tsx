import { afterEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { InstallPrompt } from "./install-prompt";

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function makeEvent(): BeforeInstallPromptEvent {
	const evt = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
	evt.prompt = async () => {};
	(evt as { userChoice: Promise<{ outcome: string }> }).userChoice =
		Promise.resolve({
			outcome: "accepted",
		});
	return evt;
}

afterEach(() => {
	// Reset by reloading the component on each test; no global teardown needed.
});

describe("<InstallPrompt />", () => {
	test("renders nothing by default", () => {
		const { container } = render(<InstallPrompt />);
		expect(container.querySelector(".install-prompt-button")).toBeNull();
	});

	test("renders Install button after beforeinstallprompt fires", () => {
		render(<InstallPrompt />);
		act(() => {
			window.dispatchEvent(makeEvent());
		});
		expect(screen.getByRole("button", { name: /install/i })).toBeDefined();
	});

	test("click invokes the deferred prompt and hides the button", async () => {
		const evt = makeEvent();
		let calls = 0;
		evt.prompt = async () => {
			calls += 1;
		};
		render(<InstallPrompt />);
		act(() => {
			window.dispatchEvent(evt);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /install/i }));
			// Allow the click handler's await to resolve
			await new Promise((r) => setTimeout(r, 0));
		});
		expect(calls).toBe(1);
	});
});
