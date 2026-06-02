import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { ProgressBar } from "./progress-bar";

test("ProgressBar renders 50% width for half completion", () => {
	const { container } = render(<ProgressBar value={50} total={100} />);
	const fill = container.querySelector("[style]") as HTMLElement;
	expect(fill?.style.width).toBe("50%");
});

test("ProgressBar renders 0% when total is 0", () => {
	const { container } = render(<ProgressBar value={0} total={0} />);
	const fill = container.querySelector("[style]") as HTMLElement;
	expect(fill?.style.width).toBe("0%");
});

test("ProgressBar clamps to 100% when value exceeds total", () => {
	const { container } = render(<ProgressBar value={200} total={100} />);
	const fill = container.querySelector("[style]") as HTMLElement;
	expect(fill?.style.width).toBe("100%");
});

test("ProgressBar rounds to nearest integer percent", () => {
	// 1/3 ≈ 33%
	const { container } = render(<ProgressBar value={1} total={3} />);
	const fill = container.querySelector("[style]") as HTMLElement;
	expect(fill?.style.width).toBe("33%");
});
