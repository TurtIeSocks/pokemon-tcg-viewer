// src/store/userland/supabase-row.test.ts
// Fast unit tests — no network, no Supabase stack required.
import { describe, expect, test } from "bun:test";
import {
	type BinderRow,
	binderToRow,
	type ProfileRow,
	profileToRow,
	rowToBinder,
	rowToProfile,
	rowToStack,
	type StackRow,
	stackToRow,
} from "./supabase-row";
import type { Binder, Profile, Stack } from "./types";

// ── helpers ──────────────────────────────────────────────────────────────────

/** A representative fully-populated Stack domain record. */
const FULL_STACK: Stack = {
	id: "01900000-0000-7000-8000-000000000001",
	cardId: "xy1-1",
	quantity: 2,
	acquiredAt: 1_717_200_000_000, // 2024-06-01T00:00:00.000Z
	createdAt: 1_717_100_000_000,
	updatedAt: 1_717_150_000_000,
	deletedAt: null,
	label: "My fave",
	pricePaid: 499,
	currency: "USD",
	language: "ja",
	variant: "holo",
	printing: {
		variantId: "holo-1st-edition",
		type: "holo",
		subtype: "1st-edition",
		size: "standard",
		stamp: ["1st-edition"],
	},
	notes: "Great condition",
	condition: null,
	grading: { company: "PSA", grade: 10, cert: "12345678" },
	source: "eBay",
	storageLocation: "Binder A",
	isPrimary: true,
};

/** The corresponding Postgres row shape supabase-js returns. */
const FULL_STACK_ROW: StackRow = {
	id: "01900000-0000-7000-8000-000000000001",
	card_id: "xy1-1",
	quantity: 2,
	acquired_at: "2024-06-01T00:00:00.000Z",
	created_at: "2024-05-30T20:13:20.000Z",
	updated_at: "2024-05-31T10:06:40.000Z",
	deleted_at: null,
	label: "My fave",
	price_paid: 499,
	currency: "USD",
	language: "ja",
	variant: "holo",
	printing: {
		variantId: "holo-1st-edition",
		type: "holo",
		subtype: "1st-edition",
		size: "standard",
		stamp: ["1st-edition"],
	},
	notes: "Great condition",
	condition: null,
	grading_company: "PSA",
	grading_grade: 10,
	grading_cert: "12345678",
	source: "eBay",
	storage_location: "Binder A",
	is_primary: true,
};

/** A minimal stack — all nullable fields null. */
const MIN_STACK: Stack = {
	id: "01900000-0000-7000-8000-000000000002",
	cardId: "base1-4",
	quantity: 1,
	acquiredAt: 1_717_200_000_000,
	createdAt: 1_717_100_000_000,
	updatedAt: 1_717_100_000_000,
	deletedAt: null,
	label: null,
	pricePaid: null,
	currency: "USD",
	language: "en",
	variant: null,
	printing: null,
	notes: null,
	condition: "NM",
	grading: null,
	source: null,
	storageLocation: null,
	isPrimary: false,
};

const MIN_STACK_ROW: StackRow = {
	id: "01900000-0000-7000-8000-000000000002",
	card_id: "base1-4",
	quantity: 1,
	acquired_at: "2024-06-01T00:00:00.000Z",
	created_at: "2024-05-30T20:13:20.000Z",
	updated_at: "2024-05-30T20:13:20.000Z",
	deleted_at: null,
	label: null,
	price_paid: null,
	currency: "USD",
	language: "en",
	variant: null,
	printing: null,
	notes: null,
	condition: "NM",
	grading_company: null,
	grading_grade: null,
	grading_cert: null,
	source: null,
	storage_location: null,
	is_primary: false,
};

const FULL_BINDER: Binder = {
	id: "01900000-0000-7000-8000-000000000010",
	name: "Fire Types",
	description: "All my fire cards",
	rules: [
		{
			id: "rule-1",
			query: {
				text: "charizard",
				setId: null,
				dexNumber: null,
				types: ["Fire"],
				rarities: [],
				supertypes: [],
				subtypes: [],
				yearMin: null,
				yearMax: null,
				mode: "fuzzy",
			},
		},
	],
	includeCardIds: ["xy1-5", "xy1-6"],
	excludeCardIds: ["xy1-7"],
	createdAt: 1_717_100_000_000,
	updatedAt: 1_717_150_000_000,
	deletedAt: null,
};

const FULL_BINDER_ROW: BinderRow = {
	id: "01900000-0000-7000-8000-000000000010",
	name: "Fire Types",
	description: "All my fire cards",
	rules: [
		{
			id: "rule-1",
			query: {
				text: "charizard",
				setId: null,
				dexNumber: null,
				types: ["Fire"],
				rarities: [],
				supertypes: [],
				subtypes: [],
				yearMin: null,
				yearMax: null,
				mode: "fuzzy",
			},
		},
	],
	include_card_ids: ["xy1-5", "xy1-6"],
	exclude_card_ids: ["xy1-7"],
	created_at: "2024-05-30T20:13:20.000Z",
	updated_at: "2024-05-31T10:06:40.000Z",
	deleted_at: null,
};

const FULL_PROFILE: Profile = {
	id: "abc-uid-123",
	displayName: "Rin",
	bio: "Collects Fire types",
	avatarPreset: "ember",
	favoriteSetId: "base1",
	displayLanguage: "fr",
	uiLanguage: "fr",
	displayCurrency: "EUR",
	hideValue: false,
	createdAt: 1_717_100_000_000,
	updatedAt: 1_717_150_000_000,
	deletedAt: null,
};

const FULL_PROFILE_ROW: ProfileRow = {
	id: "abc-uid-123",
	display_name: "Rin",
	bio: "Collects Fire types",
	avatar_preset: "ember",
	favorite_set_id: "base1",
	display_language: "fr",
	ui_language: "fr",
	display_currency: "EUR",
	hide_value: false,
	created_at: "2024-05-30T20:13:20.000Z",
	updated_at: "2024-05-31T10:06:40.000Z",
	deleted_at: null,
};

// ── timestamp helpers ─────────────────────────────────────────────────────────

describe("timestamp conversion", () => {
	test("ms epoch → ISO string", () => {
		// 1_717_200_000_000 ms = 2024-06-01T00:00:00.000Z
		const row = stackToRow(FULL_STACK);
		expect(row.acquired_at).toBe("2024-06-01T00:00:00.000Z");
	});

	test("ISO string → ms epoch", () => {
		const stack = rowToStack(FULL_STACK_ROW);
		expect(stack.acquiredAt).toBe(1_717_200_000_000);
	});

	test("round-trip: ms → ISO → ms stable", () => {
		const ms = 1_717_200_000_000;
		const iso = new Date(ms).toISOString();
		const back = new Date(iso).getTime();
		expect(back).toBe(ms);
		// verify through the mapper pair
		const row = stackToRow(FULL_STACK);
		const domain = rowToStack(row);
		expect(domain.acquiredAt).toBe(FULL_STACK.acquiredAt);
		expect(domain.createdAt).toBe(FULL_STACK.createdAt);
		expect(domain.updatedAt).toBe(FULL_STACK.updatedAt);
	});

	test("null deletedAt passthrough", () => {
		const row = stackToRow(FULL_STACK);
		expect(row.deleted_at).toBeNull();
		const domain = rowToStack(FULL_STACK_ROW);
		expect(domain.deletedAt).toBeNull();
	});

	test("non-null deletedAt round-trips", () => {
		const ts = 1_718_000_000_000;
		const s: Stack = { ...FULL_STACK, deletedAt: ts };
		const row = stackToRow(s);
		expect(row.deleted_at).toBe(new Date(ts).toISOString());
		const domain = rowToStack({
			...FULL_STACK_ROW,
			deleted_at: row.deleted_at,
		});
		expect(domain.deletedAt).toBe(ts);
	});
});

// ── stack mappers ─────────────────────────────────────────────────────────────

describe("stackToRow", () => {
	test("camelCase → snake_case", () => {
		const row = stackToRow(FULL_STACK);
		expect(row.card_id).toBe("xy1-1");
		expect(row.price_paid).toBe(499);
		expect(row.storage_location).toBe("Binder A");
		expect(row.is_primary).toBe(true);
		expect("cardId" in row).toBe(false);
		expect("pricePaid" in row).toBe(false);
	});

	test("grading {company,grade,cert} → three flat columns", () => {
		const row = stackToRow(FULL_STACK);
		expect(row.grading_company).toBe("PSA");
		expect(row.grading_grade).toBe(10);
		expect(row.grading_cert).toBe("12345678");
		expect("grading" in row).toBe(false);
	});

	test("null grading → all grading columns null", () => {
		const row = stackToRow(MIN_STACK);
		expect(row.grading_company).toBeNull();
		expect(row.grading_grade).toBeNull();
		expect(row.grading_cert).toBeNull();
	});

	test("cert null when graded but cert not recorded", () => {
		const s: Stack = {
			...FULL_STACK,
			grading: { company: "BGS", grade: 9.5, cert: null },
		};
		const row = stackToRow(s);
		expect(row.grading_company).toBe("BGS");
		expect(row.grading_grade).toBe(9.5);
		expect(row.grading_cert).toBeNull();
	});

	test("language passthrough", () => {
		const row = stackToRow(FULL_STACK);
		expect(row.language).toBe("ja");
	});

	test("pricePaid integer passthrough", () => {
		const row = stackToRow(FULL_STACK);
		expect(row.price_paid).toBe(499);
		expect(stackToRow(MIN_STACK).price_paid).toBeNull();
	});

	test("null discipline — no undefined values in row", () => {
		const row = stackToRow(MIN_STACK);
		for (const [k, v] of Object.entries(row)) {
			expect(v, `key ${k} should not be undefined`).not.toBeUndefined();
		}
	});
});

describe("rowToStack", () => {
	test("snake_case → camelCase", () => {
		const stack = rowToStack(FULL_STACK_ROW);
		expect(stack.cardId).toBe("xy1-1");
		expect(stack.pricePaid).toBe(499);
		expect(stack.storageLocation).toBe("Binder A");
		expect(stack.isPrimary).toBe(true);
		expect("card_id" in stack).toBe(false);
	});

	test("three grading columns → {company,grade,cert}", () => {
		const stack = rowToStack(FULL_STACK_ROW);
		expect(stack.grading).toEqual({
			company: "PSA",
			grade: 10,
			cert: "12345678",
		});
	});

	test("null grading columns → grading null", () => {
		const stack = rowToStack(MIN_STACK_ROW);
		expect(stack.grading).toBeNull();
	});

	test("graded + cert null → cert null in object", () => {
		const row: StackRow = {
			...FULL_STACK_ROW,
			grading_company: "CGC",
			grading_grade: 9,
			grading_cert: null,
		};
		const stack = rowToStack(row);
		expect(stack.grading).toEqual({ company: "CGC", grade: 9, cert: null });
	});

	test("full round-trip: domain → row → domain (field equality)", () => {
		const row = stackToRow(FULL_STACK);
		const back = rowToStack(row);
		// compare all fields
		expect(back.id).toBe(FULL_STACK.id);
		expect(back.cardId).toBe(FULL_STACK.cardId);
		expect(back.quantity).toBe(FULL_STACK.quantity);
		expect(back.acquiredAt).toBe(FULL_STACK.acquiredAt);
		expect(back.createdAt).toBe(FULL_STACK.createdAt);
		expect(back.updatedAt).toBe(FULL_STACK.updatedAt);
		expect(back.deletedAt).toBe(FULL_STACK.deletedAt);
		expect(back.label).toBe(FULL_STACK.label);
		expect(back.pricePaid).toBe(FULL_STACK.pricePaid);
		expect(back.currency).toBe(FULL_STACK.currency);
		expect(back.language).toBe(FULL_STACK.language);
		expect(back.variant).toBe(FULL_STACK.variant);
		expect(back.notes).toBe(FULL_STACK.notes);
		expect(back.condition).toBe(FULL_STACK.condition);
		expect(back.grading).toEqual(FULL_STACK.grading);
		expect(back.source).toBe(FULL_STACK.source);
		expect(back.storageLocation).toBe(FULL_STACK.storageLocation);
		expect(back.isPrimary).toBe(FULL_STACK.isPrimary);
	});

	test("minimal round-trip", () => {
		const row = stackToRow(MIN_STACK);
		const back = rowToStack(row);
		expect(back.cardId).toBe(MIN_STACK.cardId);
		expect(back.pricePaid).toBeNull();
		expect(back.grading).toBeNull();
		expect(back.condition).toBe("NM");
	});

	test("null discipline — no undefined values in domain", () => {
		const stack = rowToStack(MIN_STACK_ROW);
		for (const [k, v] of Object.entries(stack)) {
			expect(v, `key ${k} should not be undefined`).not.toBeUndefined();
		}
	});
});

// ── binder mappers ────────────────────────────────────────────────────────────

describe("binderToRow", () => {
	test("camelCase → snake_case", () => {
		const row = binderToRow(FULL_BINDER);
		expect(row.include_card_ids).toEqual(["xy1-5", "xy1-6"]);
		expect(row.exclude_card_ids).toEqual(["xy1-7"]);
		expect("includeCardIds" in row).toBe(false);
	});

	test("rules → jsonb passthrough (already parsed object)", () => {
		const row = binderToRow(FULL_BINDER);
		expect(row.rules).toEqual(FULL_BINDER.rules);
	});

	test("timestamps ms → ISO", () => {
		const row = binderToRow(FULL_BINDER);
		expect(row.created_at).toBe("2024-05-30T20:13:20.000Z");
		expect(row.updated_at).toBe("2024-05-31T10:06:40.000Z");
	});

	test("null deletedAt passthrough", () => {
		const row = binderToRow(FULL_BINDER);
		expect(row.deleted_at).toBeNull();
	});
});

describe("rowToBinder", () => {
	test("snake_case → camelCase", () => {
		const binder = rowToBinder(FULL_BINDER_ROW);
		expect(binder.includeCardIds).toEqual(["xy1-5", "xy1-6"]);
		expect(binder.excludeCardIds).toEqual(["xy1-7"]);
		expect("include_card_ids" in binder).toBe(false);
	});

	test("rules jsonb passthrough", () => {
		const binder = rowToBinder(FULL_BINDER_ROW);
		expect(binder.rules).toEqual(FULL_BINDER.rules);
	});

	test("timestamps ISO → ms", () => {
		const binder = rowToBinder(FULL_BINDER_ROW);
		expect(binder.createdAt).toBe(1_717_100_000_000); // 2024-05-30T20:13:20Z
		expect(binder.updatedAt).toBe(1_717_150_000_000); // 2024-05-31T10:06:40Z
	});

	test("full round-trip", () => {
		const row = binderToRow(FULL_BINDER);
		const back = rowToBinder(row);
		expect(back.id).toBe(FULL_BINDER.id);
		expect(back.name).toBe(FULL_BINDER.name);
		expect(back.description).toBe(FULL_BINDER.description);
		expect(back.rules).toEqual(FULL_BINDER.rules);
		expect(back.includeCardIds).toEqual(FULL_BINDER.includeCardIds);
		expect(back.excludeCardIds).toEqual(FULL_BINDER.excludeCardIds);
		expect(back.createdAt).toBe(FULL_BINDER.createdAt);
		expect(back.updatedAt).toBe(FULL_BINDER.updatedAt);
		expect(back.deletedAt).toBe(FULL_BINDER.deletedAt);
	});

	test("null description preserved", () => {
		const b: Binder = { ...FULL_BINDER, description: null };
		const row = binderToRow(b);
		expect(row.description).toBeNull();
		const back = rowToBinder(row);
		expect(back.description).toBeNull();
	});
});

// ── profile mappers ───────────────────────────────────────────────────────────

describe("profileToRow", () => {
	test("camelCase → snake_case", () => {
		const row = profileToRow(FULL_PROFILE);
		expect(row.display_name).toBe("Rin");
		expect(row.avatar_preset).toBe("ember");
		expect(row.favorite_set_id).toBe("base1");
		expect("displayName" in row).toBe(false);
	});

	test("id passes through as-is (no remap)", () => {
		const row = profileToRow(FULL_PROFILE);
		expect(row.id).toBe("abc-uid-123");
	});

	test("timestamps ms → ISO", () => {
		const row = profileToRow(FULL_PROFILE);
		expect(row.created_at).toBe("2024-05-30T20:13:20.000Z");
		expect(row.updated_at).toBe("2024-05-31T10:06:40.000Z");
	});
});

describe("rowToProfile", () => {
	test("snake_case → camelCase", () => {
		const p = rowToProfile(FULL_PROFILE_ROW);
		expect(p.displayName).toBe("Rin");
		expect(p.avatarPreset).toBe("ember");
		expect(p.favoriteSetId).toBe("base1");
		expect("display_name" in p).toBe(false);
	});

	test("id passes through as-is", () => {
		const p = rowToProfile(FULL_PROFILE_ROW);
		expect(p.id).toBe("abc-uid-123");
	});

	test("full round-trip", () => {
		const row = profileToRow(FULL_PROFILE);
		const back = rowToProfile(row);
		expect(back.id).toBe(FULL_PROFILE.id);
		expect(back.displayName).toBe(FULL_PROFILE.displayName);
		expect(back.bio).toBe(FULL_PROFILE.bio);
		expect(back.avatarPreset).toBe(FULL_PROFILE.avatarPreset);
		expect(back.favoriteSetId).toBe(FULL_PROFILE.favoriteSetId);
		expect(back.createdAt).toBe(FULL_PROFILE.createdAt);
		expect(back.updatedAt).toBe(FULL_PROFILE.updatedAt);
		expect(back.deletedAt).toBe(FULL_PROFILE.deletedAt);
	});

	test("null bio + null favoriteSetId preserved", () => {
		const p: Profile = { ...FULL_PROFILE, bio: null, favoriteSetId: null };
		const row = profileToRow(p);
		expect(row.bio).toBeNull();
		expect(row.favorite_set_id).toBeNull();
		const back = rowToProfile(row);
		expect(back.bio).toBeNull();
		expect(back.favoriteSetId).toBeNull();
	});
});
