import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import "fake-indexeddb/auto";

// Neither apiBase() has a hardcoded fallback any more — both throw when unset,
// so a fork can never silently borrow someone else's Worker. Tests mock fetch,
// so any syntactically valid base will do; these only have to exist.
//
// VITE_API_BASE is the client-side one, read at module load from
// import.meta.env (which Bun backs with process.env). A developer's .env
// supplies it locally, which is exactly how its absence went unnoticed: the
// corpus-runtime suite passes on a machine with .env and fails on a clean
// checkout, which is what CI runs.
process.env.API_BASE ??= "https://worker.test";
process.env.VITE_API_BASE ??= "https://worker.test";

// Must register before @testing-library/react is imported so that RTL's
// screen object sees a live document at module evaluation time.
GlobalRegistrator.register();

// RTL's auto-cleanup hooks into Jest globals. Bun's test runner doesn't
// trigger that path, so register cleanup explicitly. Without this, mounted
// components from one test file leak into the next file's DOM.
const { cleanup } =
	require("@testing-library/react") as typeof import("@testing-library/react");

// Required lazily for the same reason as RTL above: everything here must load
// after GlobalRegistrator.register().
const { useCorpusRuntime } =
	require("./store/corpus/corpus-runtime-store") as typeof import("./store/corpus/corpus-runtime-store");

afterEach(() => {
	cleanup();
	// Reset the corpus runtime between tests. `bun test` runs all 217 files in
	// ONE process, so this module-level store is shared by every file and leaks
	// forward: whatever the previous test left is what the next one starts with.
	//
	// activeRegion is the sharp edge. The store's `reset()` deliberately
	// preserves it (the app wants a refetch to stay on the current catalog), so
	// a single test that switches to "asia" silently changes behaviour for every
	// later file — `useActiveRegionNavTree` starts calling a server fn that has
	// no Start context under test, and `seedCorpus` used to derive a null index.
	// Nothing throws at the seam; components just render empty.
	//
	// That made failures depend on file order, and file order depends on the
	// filesystem, so the suite passed on macOS and failed on Linux CI. Resetting
	// the region explicitly is what makes each file start from the same place.
	const corpus = useCorpusRuntime.getState();
	corpus.reset();
	corpus.setActiveRegion("west");
});
