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

test("shows the download CTA when off", () => {
	useDetailRuntime.setState({ status: "off", enabled: false });
	render(<CardDatabaseSetting />);
	expect(screen.getByText(/download/i)).toBeTruthy();
});

test("shows saved + a re-sync/remove when ready", () => {
	useDetailRuntime.setState({ status: "ready", enabled: true, syncedAt: 1 });
	render(<CardDatabaseSetting />);
	expect(screen.getByText(/saved/i)).toBeTruthy();
	expect(screen.getByText(/remove/i)).toBeTruthy();
});

test("shows update available when stale", () => {
	useDetailRuntime.setState({ status: "stale", enabled: true });
	render(<CardDatabaseSetting />);
	expect(screen.getAllByText(/update|re-?sync/i).length).toBeGreaterThan(0);
});
