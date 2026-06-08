import { beforeEach, expect, test } from "bun:test";
import { useRecentsStore } from "../../store/recents";
import { renderInRouter } from "../../test-utils";
import { HomeRecents } from "./home-recents";

beforeEach(() => {
	useRecentsStore.setState({ recentSearches: [], recentlyViewed: [] });
});

test("HomeRecents renders nothing when there are no recents", async () => {
	const { container } = await renderInRouter(<HomeRecents />);
	// Empty store → no sections. Component must not throw and renders empty.
	expect(container.querySelectorAll("section").length).toBe(0);
});
