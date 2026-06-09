// src/store/userland/share.test.ts
import { describe, expect, it } from "bun:test";
import {
	type BinderSnapshot,
	buildSnapshot,
	decodeSnapshot,
	encodeSnapshot,
	isValidSnapshot,
} from "./share";
import type { Binder, Stack } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseBinder: Binder = {
	id: "b1",
	name: "Test Binder",
	description: "A binder for testing",
	rules: [],
	includeCardIds: [],
	excludeCardIds: [],
	createdAt: 1000,
	updatedAt: 2000,
	deletedAt: null,
};

function makeItem(overrides: Partial<Stack> & { cardId: string }): Stack {
	return {
		id: `stack-${overrides.cardId}`,
		acquiredAt: 1000,
		createdAt: 1000,
		updatedAt: 1000,
		deletedAt: null,
		quantity: 1,
		source: null,
		storageLocation: null,
		label: null,
		pricePaid: null,
		currency: "USD",
		language: "en",
		variant: null,
		notes: null,
		condition: null,
		grading: null,
		isPrimary: false,
		...overrides,
	};
}

const baseSnapshot: BinderSnapshot = {
	v: 1,
	name: "Test Binder",
	description: "A binder for testing",
	sharedAt: 9999,
	scope: "all",
	cards: [
		{ cardId: "a", owned: true, condition: "NM", grade: "PSA 10" },
		{ cardId: "b", owned: false },
		{ cardId: "c", owned: true },
	],
};

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe("encodeSnapshot / decodeSnapshot round-trip", () => {
	it("returns deep-equal snapshot", () => {
		const encoded = encodeSnapshot(baseSnapshot);
		const decoded = decodeSnapshot(encoded);
		expect(decoded).toEqual(baseSnapshot);
	});

	it("encoded string contains no + / = characters", () => {
		const encoded = encodeSnapshot(baseSnapshot);
		expect(encoded).not.toMatch(/[+/=]/);
	});

	// Regression: encode/decode run in the BROWSER (share dialog + /vault/shared),
	// which has no Node `Buffer`. Earlier impl used Buffer and crashed at runtime.
	it("round-trips without Node Buffer (browser-safe)", () => {
		const orig = globalThis.Buffer;
		// @ts-expect-error — simulate a browser env with no Buffer global
		globalThis.Buffer = undefined;
		try {
			expect(decodeSnapshot(encodeSnapshot(baseSnapshot))).toEqual(
				baseSnapshot,
			);
		} finally {
			globalThis.Buffer = orig;
		}
	});
});

// ---------------------------------------------------------------------------
// buildSnapshot — scope filter
// ---------------------------------------------------------------------------

describe("buildSnapshot scope", () => {
	// members: a(owned), b(missing), c(owned)
	const members = new Set(["a", "b", "c"]);
	const ownedCardIds = new Set(["a", "c"]);
	const stacksByCard = new Map<string, Stack[]>();

	it('scope:"all" includes all three with correct owned flags', () => {
		const snap = buildSnapshot({
			binder: baseBinder,
			members,
			ownedCardIds,
			stacksByCard,
			scope: "all",
			includeGrades: false,
			sharedAt: 1,
		});
		expect(snap.cards.map((c) => c.cardId)).toEqual(["a", "b", "c"]);
		expect(snap.cards.find((c) => c.cardId === "a")?.owned).toBe(true);
		expect(snap.cards.find((c) => c.cardId === "b")?.owned).toBe(false);
		expect(snap.cards.find((c) => c.cardId === "c")?.owned).toBe(true);
	});

	it('scope:"owned" keeps only a and c', () => {
		const snap = buildSnapshot({
			binder: baseBinder,
			members,
			ownedCardIds,
			stacksByCard,
			scope: "owned",
			includeGrades: false,
			sharedAt: 1,
		});
		expect(snap.cards.map((c) => c.cardId)).toEqual(["a", "c"]);
		expect(snap.cards.every((c) => c.owned)).toBe(true);
	});

	it('scope:"needed" keeps only b', () => {
		const snap = buildSnapshot({
			binder: baseBinder,
			members,
			ownedCardIds,
			stacksByCard,
			scope: "needed",
			includeGrades: false,
			sharedAt: 1,
		});
		expect(snap.cards.map((c) => c.cardId)).toEqual(["b"]);
		expect(snap.cards[0].owned).toBe(false);
	});

	it("cards are sorted alphabetically (stable order)", () => {
		// members inserted in reverse order
		const revMembers = new Set(["c", "b", "a"]);
		const snap = buildSnapshot({
			binder: baseBinder,
			members: revMembers,
			ownedCardIds,
			stacksByCard,
			scope: "all",
			includeGrades: false,
			sharedAt: 1,
		});
		expect(snap.cards.map((c) => c.cardId)).toEqual(["a", "b", "c"]);
	});
});

// ---------------------------------------------------------------------------
// buildSnapshot — grades
// ---------------------------------------------------------------------------

describe("buildSnapshot includeGrades", () => {
	const members = new Set(["graded", "condOnly", "missing"]);
	const ownedCardIds = new Set(["graded", "condOnly"]);

	const gradedCopy = makeItem({
		cardId: "graded",
		condition: "NM",
		grading: { company: "PSA", grade: 10, cert: null },
		createdAt: 500,
	});
	const condOnlyCopy = makeItem({
		cardId: "condOnly",
		condition: "LP",
		grading: null,
		createdAt: 600,
	});

	const stacksByCard = new Map([
		["graded", [gradedCopy]],
		["condOnly", [condOnlyCopy]],
	]);

	it("includeGrades:false → no condition/grade keys on any card", () => {
		const snap = buildSnapshot({
			binder: baseBinder,
			members,
			ownedCardIds,
			stacksByCard,
			scope: "all",
			includeGrades: false,
			sharedAt: 1,
		});
		for (const card of snap.cards) {
			expect(card).not.toHaveProperty("condition");
			expect(card).not.toHaveProperty("grade");
		}
	});

	it("includeGrades:true → graded card gets grade:PSA 10", () => {
		const snap = buildSnapshot({
			binder: baseBinder,
			members,
			ownedCardIds,
			stacksByCard,
			scope: "all",
			includeGrades: true,
			sharedAt: 1,
		});
		const graded = snap.cards.find((c) => c.cardId === "graded");
		expect(graded?.grade).toBe("PSA 10");
		expect(graded?.condition).toBe("NM");
	});

	it("includeGrades:true → cond-only card gets condition but no grade", () => {
		const snap = buildSnapshot({
			binder: baseBinder,
			members,
			ownedCardIds,
			stacksByCard,
			scope: "all",
			includeGrades: true,
			sharedAt: 1,
		});
		const cond = snap.cards.find((c) => c.cardId === "condOnly");
		expect(cond?.condition).toBe("LP");
		expect(cond).not.toHaveProperty("grade");
	});

	it("includeGrades:true → missing card never gets grade/condition", () => {
		const snap = buildSnapshot({
			binder: baseBinder,
			members,
			ownedCardIds,
			stacksByCard,
			scope: "all",
			includeGrades: true,
			sharedAt: 1,
		});
		const miss = snap.cards.find((c) => c.cardId === "missing");
		expect(miss?.owned).toBe(false);
		expect(miss).not.toHaveProperty("condition");
		expect(miss).not.toHaveProperty("grade");
	});

	it("isPrimary stack is preferred over earliest-createdAt", () => {
		const early = makeItem({
			cardId: "multi",
			condition: "DMG",
			createdAt: 100,
		});
		const primary = makeItem({
			cardId: "multi",
			condition: "NM",
			grading: { company: "BGS", grade: 9.5, cert: null },
			createdAt: 900,
			isPrimary: true,
		});
		const snap = buildSnapshot({
			binder: baseBinder,
			members: new Set(["multi"]),
			ownedCardIds: new Set(["multi"]),
			stacksByCard: new Map([["multi", [early, primary]]]),
			scope: "all",
			includeGrades: true,
			sharedAt: 1,
		});
		const card = snap.cards[0];
		expect(card.condition).toBe("NM");
		expect(card.grade).toBe("BGS 9.5");
	});

	it("earliest-createdAt stack used when no isPrimary", () => {
		const later = makeItem({
			cardId: "multi2",
			condition: "LP",
			createdAt: 900,
		});
		const earlier = makeItem({
			cardId: "multi2",
			condition: "NM",
			createdAt: 100,
		});
		const snap = buildSnapshot({
			binder: baseBinder,
			members: new Set(["multi2"]),
			ownedCardIds: new Set(["multi2"]),
			stacksByCard: new Map([["multi2", [later, earlier]]]),
			scope: "all",
			includeGrades: true,
			sharedAt: 1,
		});
		expect(snap.cards[0].condition).toBe("NM");
	});
});

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

describe("privacy — pricePaid and notes never appear", () => {
	it("snapshot JSON contains no pricePaid/notes data", () => {
		const sensitiveItem = makeItem({
			cardId: "secret",
			pricePaid: 99999,
			notes: "TOP_SECRET_COLLECTOR_NOTE",
			condition: "NM",
		});

		const snap = buildSnapshot({
			binder: baseBinder,
			members: new Set(["secret"]),
			ownedCardIds: new Set(["secret"]),
			stacksByCard: new Map([["secret", [sensitiveItem]]]),
			scope: "all",
			includeGrades: true,
			sharedAt: 1,
		});

		const json = JSON.stringify(snap);
		expect(json).not.toContain("99999");
		expect(json).not.toContain("TOP_SECRET_COLLECTOR_NOTE");
		expect(json).not.toContain("pricePaid");
		expect(json).not.toContain("notes");
	});
});

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

describe("decodeSnapshot — malformed input", () => {
	it("throws on clearly invalid base64 string", () => {
		expect(() => decodeSnapshot("not-valid-base64!!")).toThrow(
			"Invalid binder snapshot",
		);
	});

	it("throws on valid encoding of invalid shape", () => {
		// encode something that is not a BinderSnapshot
		const badPayload = JSON.stringify({ hello: "world" });
		const { deflateSync: def, strToU8: s } = require("fflate");
		const compressed = def(s(badPayload));
		const b64url = Buffer.from(compressed)
			.toString("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		expect(() => decodeSnapshot(b64url)).toThrow("Invalid binder snapshot");
	});

	it("isValidSnapshot({}) returns false", () => {
		expect(isValidSnapshot({})).toBe(false);
	});

	it("isValidSnapshot(null) returns false", () => {
		expect(isValidSnapshot(null)).toBe(false);
	});

	it("isValidSnapshot with wrong scope returns false", () => {
		expect(
			isValidSnapshot({
				v: 1,
				name: "n",
				scope: "wrong",
				cards: [],
			}),
		).toBe(false);
	});

	it("isValidSnapshot with valid shape returns true", () => {
		expect(
			isValidSnapshot({
				v: 1,
				name: "n",
				description: null,
				sharedAt: 0,
				scope: "all",
				cards: [{ cardId: "x", owned: true }],
			}),
		).toBe(true);
	});

	it("isValidSnapshot rejects a non-string, non-null description", () => {
		expect(
			isValidSnapshot({
				v: 1,
				name: "n",
				description: 123,
				sharedAt: 0,
				scope: "all",
				cards: [{ cardId: "x", owned: true }],
			}),
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Security hardening
// ---------------------------------------------------------------------------

describe("decodeSnapshot — security hardening", () => {
	it("throws on an over-long encoded string (> 100_000 chars)", () => {
		const longString = "a".repeat(100_001);
		expect(() => decodeSnapshot(longString)).toThrow("Invalid binder snapshot");
	});

	it("isValidSnapshot rejects non-numeric sharedAt", () => {
		expect(
			isValidSnapshot({
				v: 1,
				name: "n",
				description: null,
				sharedAt: "not-a-number",
				scope: "all",
				cards: [],
			}),
		).toBe(false);
	});

	it("isValidSnapshot rejects Infinity sharedAt", () => {
		expect(
			isValidSnapshot({
				v: 1,
				name: "n",
				description: null,
				sharedAt: Number.POSITIVE_INFINITY,
				scope: "all",
				cards: [],
			}),
		).toBe(false);
	});

	it("isValidSnapshot rejects cards array over the 50_000 cap", () => {
		expect(
			isValidSnapshot({
				v: 1,
				name: "n",
				description: null,
				sharedAt: 0,
				scope: "all",
				cards: Array.from({ length: 50_001 }, (_, i) => ({
					cardId: `c${i}`,
					owned: false,
				})),
			}),
		).toBe(false);
	});

	it("isValidSnapshot accepts cards array exactly at the 50_000 cap", () => {
		expect(
			isValidSnapshot({
				v: 1,
				name: "n",
				description: null,
				sharedAt: 0,
				scope: "all",
				cards: Array.from({ length: 50_000 }, (_, i) => ({
					cardId: `c${i}`,
					owned: false,
				})),
			}),
		).toBe(true);
	});
});
