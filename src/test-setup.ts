import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import "fake-indexeddb/auto";

// apiBase() has no hardcoded fallback any more — it throws when API_BASE is
// unset so a fork can never silently borrow someone else's Worker. Tests mock
// fetch, so any syntactically valid base will do; this only has to exist.
process.env.API_BASE ??= "https://worker.test";

// Must register before @testing-library/react is imported so that RTL's
// screen object sees a live document at module evaluation time.
GlobalRegistrator.register();

// RTL's auto-cleanup hooks into Jest globals. Bun's test runner doesn't
// trigger that path, so register cleanup explicitly. Without this, mounted
// components from one test file leak into the next file's DOM.
const { cleanup } =
	require("@testing-library/react") as typeof import("@testing-library/react");

afterEach(() => {
	cleanup();
});
