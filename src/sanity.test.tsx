import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

test("React renders into happy-dom", () => {
	render(<div>hello phase 0</div>);
	expect(screen.getByText("hello phase 0")).toBeDefined();
});
