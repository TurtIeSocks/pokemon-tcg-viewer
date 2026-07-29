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

afterEach(() => {
	cleanup();
});
