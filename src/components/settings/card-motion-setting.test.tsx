import { afterEach, beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useUiPrefs } from "@/store/ui-prefs";
import { CardMotionSetting } from "./card-motion-setting";

beforeEach(() => {
	useUiPrefs.setState({ cardMotion: true });
});
afterEach(() => {
	useUiPrefs.setState({ cardMotion: true });
});

test("reflects the default (motion on) as a checked switch", () => {
	render(<CardMotionSetting />);
	const sw = screen.getByRole("switch", { name: /card motion/i });
	expect(sw.getAttribute("aria-checked")).toBe("true");
});

test("toggling the switch flips the persisted cardMotion pref", () => {
	render(<CardMotionSetting />);
	const sw = screen.getByRole("switch", { name: /card motion/i });
	fireEvent.click(sw);
	expect(useUiPrefs.getState().cardMotion).toBe(false);
});

test("shows helper copy and uses no em-dashes", () => {
	const { container } = render(<CardMotionSetting />);
	expect(screen.getByText(/calmer/i)).toBeDefined();
	expect(container.textContent).not.toContain("—");
});
