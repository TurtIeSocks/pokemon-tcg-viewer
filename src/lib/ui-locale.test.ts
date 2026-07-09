import { afterAll, beforeAll, expect, test } from "bun:test";
import { getLocale, setLocale } from "../paraglide/runtime";
import { resetUserlandForTests } from "../store/userland/userland-store";
import { setupUserlandTest } from "../test-utils";
import { setUiLanguage } from "./ui-locale";

// setUiLanguage's setLocale({ reload: false }) resolves the new locale via the
// cookie strategy, and happy-dom only persists document.cookie writes against a
// real origin — the default `about:blank` document silently drops them. Give
// the shared window a URL for this file's assertion, then restore it so later
// test files (sharing the same preloaded happy-dom process) see the original
// blank state. Same fix as `loader-region.test.ts` (Task 3).
let originalUrl: string;
beforeAll(() => {
	originalUrl = document.location.href;
	// @ts-expect-error happy-dom-only global, not in lib.dom.d.ts
	globalThis.happyDOM.setURL("http://localhost/");
});
afterAll(() => {
	// Restore shared module state for later test files in this preloaded process:
	// this test switches the global Paraglide locale + userland store to "ja".
	setLocale("en", { reload: false });
	resetUserlandForTests();
	// @ts-expect-error happy-dom-only global, not in lib.dom.d.ts
	globalThis.happyDOM.setURL(originalUrl);
});

test("setUiLanguage persists profile and updates the active locale", async () => {
	await setupUserlandTest();
	await setUiLanguage("ja");
	expect(getLocale()).toBe("ja");
});
