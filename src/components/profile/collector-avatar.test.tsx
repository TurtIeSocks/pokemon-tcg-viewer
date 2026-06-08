// src/components/profile/collector-avatar.test.tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { CollectorAvatar } from "./collector-avatar";

test("renders initials derived from the display name", () => {
	render(<CollectorAvatar displayName="Ash Ketchum" preset="dusk" />);
	expect(screen.getByText("AK")).toBeDefined();
});

test("exposes the display name as an accessible label", () => {
	render(<CollectorAvatar displayName="Misty" preset="violet" />);
	expect(screen.getByLabelText("Misty")).toBeDefined();
});
