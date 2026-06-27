import { afterEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
	DropdownMenu,
	DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { useDetailRuntime } from "../../store/corpus/detail-runtime";
import { OfflineToggle } from "./offline-toggle";

/** Wrap the toggle in a minimal open DropdownMenu so Radix context is present. */
function renderToggle() {
	return render(
		<DropdownMenu open>
			<DropdownMenuContent>
				<OfflineToggle />
			</DropdownMenuContent>
		</DropdownMenu>,
	);
}

afterEach(() => {
	useDetailRuntime.setState({
		detailById: null,
		enabled: false,
		version: null,
		syncedAt: null,
		status: "off",
	});
});

test("shows download CTA when status is off", () => {
	useDetailRuntime.setState({ status: "off", enabled: false });
	renderToggle();
	expect(screen.getByText(/download card details/i)).toBeDefined();
});

test("shows re-sync CTA when status is stale", () => {
	useDetailRuntime.setState({ status: "stale", enabled: true });
	renderToggle();
	expect(screen.getByText(/re-sync/i)).toBeDefined();
});

test("shows saved state when status is ready", () => {
	useDetailRuntime.setState({ status: "ready", enabled: true, syncedAt: 1 });
	renderToggle();
	expect(screen.getByText(/saved/i)).toBeDefined();
});

test("shows retry copy when status is error", () => {
	useDetailRuntime.setState({ status: "error", enabled: false });
	renderToggle();
	expect(screen.getByText(/download failed/i)).toBeDefined();
});

test("shows loading copy when status is downloading", () => {
	useDetailRuntime.setState({ status: "downloading", enabled: true });
	renderToggle();
	expect(screen.getByText(/downloading card details/i)).toBeDefined();
});

test("shows remove option when status is ready", () => {
	useDetailRuntime.setState({ status: "ready", enabled: true, syncedAt: 1 });
	renderToggle();
	expect(screen.getByText(/remove offline data/i)).toBeDefined();
});
