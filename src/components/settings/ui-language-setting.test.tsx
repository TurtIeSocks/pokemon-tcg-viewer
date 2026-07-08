import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UiLanguageSetting } from "./ui-language-setting";

test("renders all 12 locales by endonym, labeled Interface language", () => {
	render(<UiLanguageSetting />);
	expect(screen.getByText("Interface language")).toBeTruthy();
	expect(screen.getByRole("option", { name: "日本語" })).toBeTruthy();
	expect(screen.getByRole("option", { name: "Français" })).toBeTruthy();
});
