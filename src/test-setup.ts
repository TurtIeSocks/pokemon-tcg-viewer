import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

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
