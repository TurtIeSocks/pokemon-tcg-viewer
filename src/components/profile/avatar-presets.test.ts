// src/components/profile/avatar-presets.test.ts
import { expect, test } from "bun:test";
import {
	AVATAR_PRESETS,
	DEFAULT_AVATAR_PRESET_ID,
	getAvatarPreset,
	initialsFrom,
} from "./avatar-presets";

test("AVATAR_PRESETS is non-empty and every preset has id + gradient", () => {
	expect(AVATAR_PRESETS.length).toBeGreaterThan(0);
	for (const p of AVATAR_PRESETS) {
		expect(typeof p.id).toBe("string");
		expect(p.gradient).toContain("gradient");
	}
});

test("getAvatarPreset returns the match, or the default for unknown/empty", () => {
	const first = AVATAR_PRESETS[0];
	expect(getAvatarPreset(first.id).id).toBe(first.id);
	expect(getAvatarPreset("nope").id).toBe(DEFAULT_AVATAR_PRESET_ID);
	expect(getAvatarPreset("").id).toBe(DEFAULT_AVATAR_PRESET_ID);
});

test("initialsFrom derives 1-2 uppercase letters", () => {
	expect(initialsFrom("Ash Ketchum")).toBe("AK");
	expect(initialsFrom("misty")).toBe("M");
	expect(initialsFrom("  brock  stone ")).toBe("BS");
	expect(initialsFrom("")).toBe("");
});
