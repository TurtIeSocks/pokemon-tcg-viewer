// owned-cards-grid.test.tsx
import { afterEach, beforeEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { clearCorpus } from "../../store/corpus/corpus-store";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { OwnedCardsGrid } from "./owned-cards-grid";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	// Pre-seed an empty corpus index so OwnedCardsGrid's loadCorpus() effect
	// early-returns instead of hitting the real /corpus network endpoint, which
	// would pollute the shared fake-indexeddb + corpus runtime for other files.
	await clearCorpus();
	useCorpusRuntime.setState({ index: buildIndex([]), loading: false });
});

afterEach(() => {
	useCorpusRuntime.setState({ index: null, loading: false });
});

test("renders empty state when no owned cards", async () => {
	render(<OwnedCardsGrid />);
	expect(screen.getByText(/your binder is empty/i)).toBeDefined();
});

test("renders without crashing", () => {
	const { container } = render(<OwnedCardsGrid />);
	expect(container).toBeDefined();
});
