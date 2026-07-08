import { afterEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { useDetailRuntime } from "@/store/corpus/detail-runtime";
import { CardDatabaseSetting } from "./card-database-setting";

afterEach(() => {
	useDetailRuntime.setState({
		detailById: null,
		enabled: false,
		version: null,
		syncedAt: null,
		status: "off",
	});
});

test("shows a download-for-offline CTA when offline details are off", () => {
	useDetailRuntime.setState({ status: "off", enabled: false });
	render(<CardDatabaseSetting />);
	expect(
		screen.getByRole("button", { name: /download for offline/i }),
	).toBeTruthy();
});

test("always offers a Refresh action (the merged catalog + details refresh)", () => {
	useDetailRuntime.setState({ status: "off", enabled: false });
	render(<CardDatabaseSetting />);
	expect(screen.getByRole("button", { name: /^refresh$/i })).toBeTruthy();
});

test("shows saved + a remove action when offline details are ready", () => {
	useDetailRuntime.setState({ status: "ready", enabled: true, syncedAt: 1 });
	render(<CardDatabaseSetting />);
	expect(screen.getByText(/saved for offline/i)).toBeTruthy();
	expect(
		screen.getByRole("button", { name: /remove offline copy/i }),
	).toBeTruthy();
});

test("prompts a refresh when offline details are stale", () => {
	useDetailRuntime.setState({ status: "stale", enabled: true });
	render(<CardDatabaseSetting />);
	expect(screen.getByText(/refresh to re-?sync/i)).toBeTruthy();
});
