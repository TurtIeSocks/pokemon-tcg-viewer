import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { isCloudEnabled } from "./client";

// `isCloudEnabled()` is a pure read of two Vite env vars. Under `bun test`,
// `import.meta.env` is a plain mutable object that ALSO mirrors `.env` (Bun
// auto-loads it), so the local-stack VITE_SUPABASE_* values are live here. To
// test both branches hermetically we snapshot the originals, clear before each
// case, set what the case needs, and restore after the file.
const env = import.meta.env as Record<string, string | undefined>;

const URL = "http://localhost:55321";
const KEY = "anon.jwt.token";

const original = {
	url: env.VITE_SUPABASE_URL,
	key: env.VITE_SUPABASE_ANON_KEY,
};

beforeEach(() => {
	delete env.VITE_SUPABASE_URL;
	delete env.VITE_SUPABASE_ANON_KEY;
});

afterAll(() => {
	env.VITE_SUPABASE_URL = original.url;
	env.VITE_SUPABASE_ANON_KEY = original.key;
});

describe("isCloudEnabled", () => {
	test("false when both env vars are absent", () => {
		expect(isCloudEnabled()).toBe(false);
	});

	test("false when only the URL is set", () => {
		env.VITE_SUPABASE_URL = URL;
		expect(isCloudEnabled()).toBe(false);
	});

	test("false when only the anon key is set", () => {
		env.VITE_SUPABASE_ANON_KEY = KEY;
		expect(isCloudEnabled()).toBe(false);
	});

	test("false when a var is set but empty", () => {
		env.VITE_SUPABASE_URL = URL;
		env.VITE_SUPABASE_ANON_KEY = "";
		expect(isCloudEnabled()).toBe(false);
	});

	test("true when both URL and anon key are set", () => {
		env.VITE_SUPABASE_URL = URL;
		env.VITE_SUPABASE_ANON_KEY = KEY;
		expect(isCloudEnabled()).toBe(true);
	});
});
