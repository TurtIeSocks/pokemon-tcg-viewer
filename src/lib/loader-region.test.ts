import { afterAll, beforeAll, expect, test } from "bun:test";
import { UI_LANG_COOKIE, writeUiLangCookie } from "./loader-region";

// happy-dom only persists document.cookie writes against a real origin — the
// default `about:blank` document silently drops them. Give the shared window a
// URL for this file's cookie assertions, then restore it so later test files
// (sharing the same preloaded happy-dom process) see the original blank state.
let originalUrl: string;
beforeAll(() => {
	originalUrl = document.location.href;
	// @ts-expect-error happy-dom-only global, not in lib.dom.d.ts
	globalThis.happyDOM.setURL("http://localhost/");
});
afterAll(() => {
	// @ts-expect-error happy-dom-only global, not in lib.dom.d.ts
	globalThis.happyDOM.setURL(originalUrl);
});

test("writeUiLangCookie writes a supported lang to the ui-lang cookie", () => {
	// biome-ignore lint/suspicious/noDocumentCookie: test setup, resets the cookie
	document.cookie = `${UI_LANG_COOKIE}=; path=/; max-age=0`;
	writeUiLangCookie("ja");
	expect(document.cookie).toContain(`${UI_LANG_COOKIE}=ja`);
});

test("writeUiLangCookie ignores unsupported langs", () => {
	// biome-ignore lint/suspicious/noDocumentCookie: test setup, seeds a prior value
	document.cookie = `${UI_LANG_COOKIE}=fr; path=/`;
	writeUiLangCookie("xx");
	expect(document.cookie).toContain(`${UI_LANG_COOKIE}=fr`);
});
