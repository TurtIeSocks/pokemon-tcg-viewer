import { afterAll, beforeAll, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { getLocale, setLocale } from "../paraglide/runtime";
import { resetUserlandForTests } from "../store/userland/userland-store";
import { setupUserlandTest } from "../test-utils";
import { LocaleBoundary, setUiLanguage } from "./ui-locale";

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

// Regression: the LocaleBoundary must re-localize to the NEW locale on the same
// switch, not lag one selection behind. That requires setUiLanguage to call
// setLocale() BEFORE updateProfile() (whose store write triggers the boundary's
// re-render synchronously); if the order flips, the boundary keys on the old
// getLocale() and the child renders the previous locale.
test("LocaleBoundary shows the new locale immediately after a switch (no off-by-one)", async () => {
	await setupUserlandTest();
	setLocale("en", { reload: false });
	const Probe = () =>
		createElement("span", { "data-testid": "active-locale" }, getLocale());
	render(createElement(LocaleBoundary, null, createElement(Probe)));
	expect(screen.getByTestId("active-locale").textContent).toBe("en");

	await act(async () => {
		await setUiLanguage("fr");
	});
	expect(screen.getByTestId("active-locale").textContent).toBe("fr");

	await act(async () => {
		await setUiLanguage("ja");
	});
	expect(screen.getByTestId("active-locale").textContent).toBe("ja");
});
