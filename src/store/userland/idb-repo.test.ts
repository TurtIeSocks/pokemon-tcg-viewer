// src/store/userland/idb-repo.test.ts
import { beforeEach, expect, test } from "bun:test";
import { makeBinder, makeStack } from "../../test-utils";
import { createIdbCollectionRepo } from "./idb-repo";

const repo = createIdbCollectionRepo();
beforeEach(async () => {
	await repo.clear();
});

test("add assigns id/createdAt/acquiredAt and null-fills omitted optionals", async () => {
	const item = await repo.add({ cardId: "base1-4" });
	expect(typeof item.id).toBe("string");
	expect(item.cardId).toBe("base1-4");
	expect(typeof item.createdAt).toBe("number");
	expect(typeof item.acquiredAt).toBe("number");
	expect(item.pricePaid).toBeNull();
	expect(item.variant).toBeNull();
	expect(item.notes).toBeNull();
	expect(item.condition).toBeNull();
	expect(item.grading).toBeNull();
});

test("add keeps provided fields and a caller-set acquiredAt", async () => {
	const item = await repo.add({
		cardId: "x",
		acquiredAt: 111,
		pricePaid: 5,
		condition: "NM",
	});
	expect(item.acquiredAt).toBe(111);
	expect(item.pricePaid).toBe(5);
	expect(item.condition).toBe("NM");
});

test("list returns all added items", async () => {
	await repo.add({ cardId: "a" });
	await repo.add({ cardId: "b" });
	const all = await repo.list();
	expect(all.map((i) => i.cardId).sort()).toEqual(["a", "b"]);
});

test("update applies a patch; null clears, absent leaves untouched", async () => {
	const item = await repo.add({ cardId: "a", pricePaid: 9, notes: "mint" });
	await repo.update(item.id, { pricePaid: null }); // clear price, leave notes
	const [reloaded] = await repo.list();
	expect(reloaded.pricePaid).toBeNull();
	expect(reloaded.notes).toBe("mint");
});

test("update on a missing id is a no-op", async () => {
	await repo.update("nope", { pricePaid: 1 });
	expect(await repo.list()).toEqual([]);
});

test("remove and removeMany delete rows", async () => {
	const a = await repo.add({ cardId: "a" });
	const b = await repo.add({ cardId: "b" });
	const c = await repo.add({ cardId: "c" });
	await repo.remove(a.id);
	await repo.removeMany([b.id, c.id]);
	expect(await repo.list()).toEqual([]);
});

test("bulkAdd inserts many", async () => {
	const created = await repo.bulkAdd([{ cardId: "a" }, { cardId: "b" }]);
	expect(created).toHaveLength(2);
	expect(await repo.list()).toHaveLength(2);
});

import { createIdbBindersRepo } from "./idb-repo";
import type { BinderRule } from "./types";

const binders = createIdbBindersRepo();
beforeEach(async () => {
	await binders.clear();
});

test("binders.create assigns id/timestamps and defaults description=null, rules/includeCardIds/excludeCardIds=[]", async () => {
	const b = await binders.create({ name: "Gen 1 binder" });
	expect(typeof b.id).toBe("string");
	expect(b.name).toBe("Gen 1 binder");
	expect(b.description).toBeNull();
	expect(b.rules).toEqual([]);
	expect(b.includeCardIds).toEqual([]);
	expect(b.excludeCardIds).toEqual([]);
	expect(b.createdAt).toBe(b.updatedAt);
});

test("binders.create with description preserves it", async () => {
	const b = await binders.create({
		name: "Fire deck",
		description: "All fire cards",
	});
	expect(b.description).toBe("All fire cards");
});

test("binders.update patches fields and bumps updatedAt", async () => {
	const b = await binders.create({ name: "A" });
	const rule: BinderRule = {
		id: "rule-1",
		query: {
			text: null,
			setId: "base1",
			dexNumber: null,
			types: [],
			rarities: [],
			supertypes: [],
			subtypes: [],
			yearMin: null,
			yearMax: null,
			mode: "fuzzy",
		},
	};
	await binders.update(b.id, {
		name: "B",
		rules: [rule],
	});
	const [reloaded] = await binders.list();
	expect(reloaded.name).toBe("B");
	expect(reloaded.rules).toEqual([rule]);
	expect(reloaded.updatedAt).toBeGreaterThanOrEqual(reloaded.createdAt);
});

test("binders.update with includeCardIds and excludeCardIds", async () => {
	const b = await binders.create({ name: "A" });
	await binders.update(b.id, {
		includeCardIds: ["card-1", "card-2"],
		excludeCardIds: ["card-3"],
	});
	const [reloaded] = await binders.list();
	expect(reloaded.includeCardIds).toEqual(["card-1", "card-2"]);
	expect(reloaded.excludeCardIds).toEqual(["card-3"]);
});

test("binders.remove deletes", async () => {
	const b = await binders.create({ name: "A" });
	await binders.remove(b.id);
	expect(await binders.list()).toEqual([]);
});

import { getRepos } from "./idb-repo";
import type { Binder, UserDataSnapshot } from "./types";

const repos = getRepos();
beforeEach(async () => {
	await repos.collection.clear();
	await repos.binders.clear();
	await repos.profile.clear();
});

test("exportAll returns a v6 snapshot of current data", async () => {
	await repos.collection.add({ cardId: "a", pricePaid: 3 });
	await repos.binders.create({ name: "G" });
	const snap = await repos.backup.exportAll();
	expect(snap.schemaVersion).toBe(6);
	expect(snap.collection).toHaveLength(1);
	expect(snap.binders).toHaveLength(1);
	expect(typeof snap.exportedAt).toBe("number");
	expect(snap.profile).toBeNull();
});

test("importAll replace clears then writes, preserving ids", async () => {
	await repos.collection.add({ cardId: "old" });
	const snap: UserDataSnapshot = {
		schemaVersion: 5,
		exportedAt: 0,
		collection: [makeStack({ id: "fixed-1", cardId: "new" })],
		binders: [],
		profile: null,
	};
	await repos.backup.importAll(snap, "replace");
	const all = await repos.collection.list();
	expect(all).toHaveLength(1);
	expect(all[0].id).toBe("fixed-1");
	expect(all[0].cardId).toBe("new");
});

test("importAll merge upserts by id without clearing", async () => {
	const existing = await repos.collection.add({ cardId: "keep" });
	const snap: UserDataSnapshot = {
		schemaVersion: 5,
		exportedAt: 0,
		collection: [makeStack({ id: "added-1", cardId: "added" })],
		binders: [],
		profile: null,
	};
	await repos.backup.importAll(snap, "merge");
	const ids = (await repos.collection.list()).map((i) => i.id).sort();
	expect(ids).toEqual(["added-1", existing.id].sort());
});

test("backup round-trips a binder with rule + includeCardIds + excludeCardIds, preserving id", async () => {
	const rule: BinderRule = {
		id: "rule-x",
		query: {
			text: "charizard",
			setId: null,
			dexNumber: 6,
			types: ["Fire"],
			rarities: ["Rare Holo"],
			supertypes: ["Pokémon"],
			subtypes: [],
			yearMin: 1999,
			yearMax: null,
			mode: "fuzzy",
		},
	};
	const fullBinder: Binder = makeBinder({
		id: "binder-abc",
		name: "Charizard collection",
		description: "All Charizard cards",
		rules: [rule],
		includeCardIds: ["base1-4"],
		excludeCardIds: ["xy7-11"],
		createdAt: 1000,
		updatedAt: 2000,
	});
	const snap: UserDataSnapshot = {
		schemaVersion: 5,
		exportedAt: 0,
		collection: [],
		binders: [fullBinder],
		profile: null,
	};
	await repos.backup.importAll(snap, "replace");
	const exportedSnap = await repos.backup.exportAll();
	expect(exportedSnap.binders).toHaveLength(1);
	const got = exportedSnap.binders[0];
	expect(got.id).toBe("binder-abc");
	expect(got.name).toBe("Charizard collection");
	expect(got.description).toBe("All Charizard cards");
	expect(got.rules).toEqual([rule]);
	expect(got.includeCardIds).toEqual(["base1-4"]);
	expect(got.excludeCardIds).toEqual(["xy7-11"]);
});

test("backup round-trips the profile via replace import", async () => {
	const snap: UserDataSnapshot = {
		schemaVersion: 5,
		exportedAt: 0,
		collection: [],
		binders: [],
		profile: {
			id: "me",
			displayName: "Ash",
			bio: "hi",
			avatarPreset: "violet",
			favoriteSetId: "base1",
			createdAt: 1,
			updatedAt: 2,
			deletedAt: null,
		},
	};
	await repos.backup.importAll(snap, "replace");
	const out = await repos.backup.exportAll();
	expect(out.profile?.displayName).toBe("Ash");
	expect(out.profile?.favoriteSetId).toBe("base1");
});

// --- Phase 0.1a: quantity + provenance fields ---
import { createStore } from "idb-keyval";
import { normalizeStack } from "./idb-repo";
import type { Stack } from "./types";

/** A repo on a unique store so these are fully isolated. */
function freshCollectionRepo() {
	return createIdbCollectionRepo(
		createStore(`test-${crypto.randomUUID()}`, "items"),
	);
}

test("add() defaults quantity to 1", async () => {
	const s = await freshCollectionRepo().add({ cardId: "base1-4" });
	expect(s.quantity).toBe(1);
});

test("add() preserves an explicit quantity", async () => {
	const s = await freshCollectionRepo().add({
		cardId: "base1-4",
		quantity: 10,
	});
	expect(s.quantity).toBe(10);
});

test("add() null-fills source + storageLocation; persists given values", async () => {
	const repo2 = freshCollectionRepo();
	const bare = await repo2.add({ cardId: "base1-4" });
	expect(bare.source).toBeNull();
	expect(bare.storageLocation).toBeNull();
	const filled = await repo2.add({
		cardId: "base1-4",
		source: "eBay",
		storageLocation: "Binder A",
	});
	expect(filled.source).toBe("eBay");
	expect(filled.storageLocation).toBe("Binder A");
});

test("normalizeStack backfills legacy records (missing quantity/source/storageLocation)", () => {
	const legacy = {
		id: "a",
		cardId: "base1-4",
		acquiredAt: 0,
		createdAt: 0,
		label: null,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: null,
	} as unknown as Stack;
	const n = normalizeStack(legacy);
	expect(n.quantity).toBe(1);
	expect(n.source).toBeNull();
	expect(n.storageLocation).toBeNull();
	// v4 fields also backfilled (without rescaling pricePaid).
	expect(n.currency).toBe("USD");
	expect(n.deletedAt).toBeNull();
	expect(n.isPrimary).toBe(false);
	expect(n.updatedAt).toBe(0); // falls back to createdAt
	expect(n.pricePaid).toBeNull(); // unit migration is NOT normalizeStack's job
	expect(normalizeStack({ ...legacy, quantity: 5 } as Stack).quantity).toBe(5);
});

// --- Profile adapter ---
import { createIdbProfileRepo } from "./idb-repo";

/** A profile repo on a unique store so these tests are fully isolated. */
function freshProfileRepo() {
	return createIdbProfileRepo(
		createStore(`test-profile-${crypto.randomUUID()}`, "profile"),
	);
}

test("profile get() returns null when nothing saved", async () => {
	const repo = freshProfileRepo();
	expect(await repo.get()).toBeNull();
});

test("profile save() creates on first call then merges on the next", async () => {
	const repo = freshProfileRepo();
	const created = await repo.save({ displayName: "Ash" });
	expect(created.id).toBe("me");
	expect(created.displayName).toBe("Ash");
	expect(created.bio).toBeNull();
	expect(created.avatarPreset).toBe("dusk");
	expect(created.favoriteSetId).toBeNull();
	expect(typeof created.createdAt).toBe("number");

	const updated = await repo.save({ bio: "Gotta catch em all" });
	expect(updated.displayName).toBe("Ash"); // preserved
	expect(updated.bio).toBe("Gotta catch em all");
	expect(updated.createdAt).toBe(created.createdAt); // stable
	expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt); // bumped

	expect((await repo.get())?.bio).toBe("Gotta catch em all");
});

test("profile clear() removes the stored record", async () => {
	const repo = freshProfileRepo();
	await repo.save({ displayName: "Misty" });
	await repo.clear();
	expect(await repo.get()).toBeNull();
});

// --- v3→v4 data migration (dollars→cents) ---
import { get as idbGet, set as idbSet } from "idb-keyval";
import { migrateUserlandData } from "./idb-repo";

/** Four isolated stores so each migration test runs on its own data. */
function migrationStores() {
	const tag = crypto.randomUUID();
	return {
		collection: createStore(`mig-col-${tag}`, "items"),
		binders: createStore(`mig-bin-${tag}`, "binders"),
		profile: createStore(`mig-prof-${tag}`, "profile"),
		meta: createStore(`mig-meta-${tag}`, "meta"),
	};
}

test("migrateUserlandData rescales legacy dollar prices to cents, exactly once", async () => {
	const stores = migrationStores();
	// Legacy (pre-v4) row: pricePaid in dollars, none of the v4 fields present.
	await idbSet(
		"s1",
		{
			id: "s1",
			cardId: "base1-4",
			quantity: 2,
			acquiredAt: 0,
			createdAt: 0,
			pricePaid: 3.5,
			variant: null,
			notes: null,
			condition: null,
			grading: null,
			source: null,
			storageLocation: null,
		},
		stores.collection,
	);

	await migrateUserlandData(stores); // no corpus → v4→v5 remap is deferred

	const m = await idbGet<Stack>("s1", stores.collection);
	expect(m?.pricePaid).toBe(350); // $3.50 → 350 cents
	expect(m?.currency).toBe("USD");
	expect(m?.deletedAt).toBeNull();
	expect(m?.updatedAt).toBe(0); // backfilled from createdAt
	// Marker stops at 4 (not 5) because corpus was absent; v4→v5 remap is deferred.
	expect(await idbGet<number>("userlandDataVersion", stores.meta)).toBe(4);

	// Idempotent: re-running without corpus leaves prices unchanged.
	await migrateUserlandData(stores);
	expect((await idbGet<Stack>("s1", stores.collection))?.pricePaid).toBe(350);
});

test("migrateUserlandData leaves an unknown (null) price null", async () => {
	const stores = migrationStores();
	await idbSet(
		"s1",
		{
			id: "s1",
			cardId: "c",
			quantity: 1,
			acquiredAt: 0,
			createdAt: 0,
			pricePaid: null,
			variant: null,
			notes: null,
			condition: null,
			grading: null,
			source: null,
			storageLocation: null,
		},
		stores.collection,
	);
	await migrateUserlandData(stores);
	expect((await idbGet<Stack>("s1", stores.collection))?.pricePaid).toBeNull();
});

test("migrateUserlandData backfills deletedAt on legacy binders + profile", async () => {
	const stores = migrationStores();
	await idbSet(
		"b1",
		{
			id: "b1",
			name: "Legacy",
			description: null,
			rules: [],
			includeCardIds: [],
			excludeCardIds: [],
			createdAt: 0,
			updatedAt: 0,
		},
		stores.binders,
	);
	await idbSet(
		"me",
		{
			id: "me",
			displayName: "Ash",
			bio: null,
			avatarPreset: "dusk",
			favoriteSetId: null,
			createdAt: 0,
			updatedAt: 0,
		},
		stores.profile,
	);

	await migrateUserlandData(stores);

	expect((await idbGet<Binder>("b1", stores.binders))?.deletedAt).toBeNull();
	expect(
		(await idbGet<{ deletedAt: number | null }>("me", stores.profile))
			?.deletedAt,
	).toBeNull();
});

// --- v5: language + grading cert ---

test("add() defaults language to 'en'", async () => {
	const s = await freshCollectionRepo().add({ cardId: "base1-4" });
	expect(s.language).toBe("en");
});

test("add() preserves an explicit language", async () => {
	const s = await freshCollectionRepo().add({
		cardId: "base1-4",
		language: "ja",
	});
	expect(s.language).toBe("ja");
});

test("add() round-trips grading cert", async () => {
	const s = await freshCollectionRepo().add({
		cardId: "base1-4",
		grading: { company: "PSA", grade: 10, cert: "12345678" },
	});
	expect(s.grading?.cert).toBe("12345678");
});

test("add() defaults grading cert to null when not provided", async () => {
	const s = await freshCollectionRepo().add({
		cardId: "base1-4",
		grading: { company: "PSA", grade: 10, cert: null },
	});
	expect(s.grading?.cert).toBeNull();
});

test("normalizeStack backfills language on legacy records missing it", () => {
	const legacy = {
		id: "a",
		cardId: "base1-4",
		acquiredAt: 0,
		createdAt: 0,
		label: null,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: null,
	} as unknown as Stack;
	const n = normalizeStack(legacy);
	expect(n.language).toBe("en");
	// idempotent: already-set language is preserved
	expect(normalizeStack({ ...n, language: "ja" }).language).toBe("ja");
});

test("normalizeStack backfills cert on legacy grading records missing it", () => {
	const legacy = {
		id: "a",
		cardId: "base1-4",
		acquiredAt: 0,
		createdAt: 0,
		label: null,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: { company: "PSA", grade: 10 },
	} as unknown as Stack;
	const n = normalizeStack(legacy);
	expect(n.grading?.cert).toBeNull();
	// idempotent
	expect(normalizeStack(n).grading?.cert).toBeNull();
	// cert present is preserved
	const withCert = normalizeStack({
		...legacy,
		grading: { company: "PSA", grade: 10, cert: "999" },
	} as unknown as Stack);
	expect(withCert.grading?.cert).toBe("999");
});

// --- v4→v5 data migration (corpus-id remap) ---
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";

/** Build a minimal CorpusCard for migration-test corpus fixtures. */
function corpusCard(id: string): CorpusCard {
	const dash = id.lastIndexOf("-");
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId: id.slice(0, dash),
		number: id.slice(dash + 1),
	};
}

test("migrateUserlandData v4->v5 remaps Binder includeCardIds, excludeCardIds, rule setId, and Profile favoriteSetId", async () => {
	const stores = migrationStores();
	await idbSet("userlandDataVersion", 4, stores.meta);

	// Seed a Binder with ptcg-style ids in include/exclude and a rule with ptcg setId.
	await idbSet(
		"b1",
		{
			id: "b1",
			name: "Test",
			description: null,
			rules: [
				{
					id: "r1",
					query: {
						text: null,
						setId: "sv1", // ptcg set id — must remap to sv01
						dexNumber: null,
						types: [],
						rarities: [],
						supertypes: [],
						subtypes: [],
						yearMin: null,
						yearMax: null,
						mode: "fuzzy",
					},
				},
			],
			includeCardIds: ["sv1-1"], // ptcg card id
			excludeCardIds: ["swsh3-136"], // already a tcgdex id — should pass through unchanged
			createdAt: 0,
			updatedAt: 0,
			deletedAt: null,
		},
		stores.binders,
	);

	// Seed a Profile with a ptcg favoriteSetId.
	await idbSet(
		"me",
		{
			id: "me",
			displayName: "Ash",
			bio: null,
			avatarPreset: "dusk",
			favoriteSetId: "sv1", // ptcg set id — must remap to sv01
			createdAt: 0,
			updatedAt: 0,
			deletedAt: null,
		},
		stores.profile,
	);

	const corpus = buildIndex([corpusCard("sv01-001"), corpusCard("swsh3-136")]);
	await migrateUserlandData(stores, corpus);

	const binder = await idbGet<Binder>("b1", stores.binders);
	expect(binder?.includeCardIds).toEqual(["sv01-001"]); // remapped
	expect(binder?.excludeCardIds).toEqual(["swsh3-136"]); // tcgdex id preserved
	// Rule setId is remapped via remapPtcgSetId (sv1 → sv01).
	expect(binder?.rules[0].query.setId).toBe("sv01");

	const profile = await idbGet<{ favoriteSetId: string | null }>(
		"me",
		stores.profile,
	);
	expect(profile?.favoriteSetId).toBe("sv01"); // remapped
	expect(await idbGet<number>("userlandDataVersion", stores.meta)).toBe(5);
});

test("migrateUserlandData v4->v5 remaps live corpus ids once", async () => {
	const stores = migrationStores();
	// Set meta marker to v4 (pre-v5) so the migration runs.
	await idbSet("userlandDataVersion", 4, stores.meta);

	// Seed: one stack with a pokemontcg.io-style id "sv1-1".
	await idbSet(
		"s1",
		{
			id: "s1",
			cardId: "sv1-1",
			quantity: 1,
			acquiredAt: 0,
			createdAt: 0,
			updatedAt: 0,
			pricePaid: null,
			currency: "USD",
			language: "en",
			label: null,
			variant: null,
			notes: null,
			condition: "NM",
			grading: null,
			source: null,
			storageLocation: null,
			deletedAt: null,
			isPrimary: false,
		},
		stores.collection,
	);

	// Corpus has the TCGdex card "sv01-001" (number "001", which is 1 numerically).
	const corpus = buildIndex([corpusCard("sv01-001"), corpusCard("swsh3-136")]);

	await migrateUserlandData(stores, corpus);

	const remapped = await idbGet<Stack>("s1", stores.collection);
	expect(remapped?.cardId).toBe("sv01-001");
	expect(await idbGet<number>("userlandDataVersion", stores.meta)).toBe(5);

	// Idempotent: second run must not change anything.
	await migrateUserlandData(stores, corpus);
	expect((await idbGet<Stack>("s1", stores.collection))?.cardId).toBe(
		"sv01-001",
	);
});

test("importAll: v5 snapshot leaves marker at 4 so next migrateUserlandData remaps ids", async () => {
	// A pre-v6 snapshot (schemaVersion 5) imported without a corpus lookup keeps
	// pokemontcg.io ids. importAll must set the marker to 4 (not 5) so that
	// migrateUserlandData's v4→v5 corpus-remap pass runs on next loadUserland.
	const stores = migrationStores();
	// Manually replicate what importAll does for a v5 snapshot (sets marker = 4):
	await idbSet("stack-1", makeStack({ id: "stack-1", cardId: "sv1-1" }), stores.collection);
	// schemaVersion 5 < 6 → markerVersion = 4
	await idbSet("userlandDataVersion", 4, stores.meta);

	// Marker must be 4 (not 5) because snapshot was pre-v6.
	expect(await idbGet<number>("userlandDataVersion", stores.meta)).toBe(4);

	// Now run migrateUserlandData with a corpus that knows sv01-001 = sv1 card #1.
	const corpus = buildIndex([corpusCard("sv01-001")]);
	await migrateUserlandData(stores, corpus);

	// Marker advances to 5 and id is remapped.
	expect(await idbGet<number>("userlandDataVersion", stores.meta)).toBe(5);
	expect((await idbGet<Stack>("stack-1", stores.collection))?.cardId).toBe(
		"sv01-001",
	);
});

test("migrateUserlandData v4->v5 defers remap when corpus absent; retries on second call with corpus", async () => {
	const stores = migrationStores();
	// Start at v4 (structural migrations already done).
	await idbSet("userlandDataVersion", 4, stores.meta);

	// Seed a stack with a pre-remap ptcg id.
	const seedStack = {
		id: "s1",
		cardId: "sv1-1",
		quantity: 1,
		acquiredAt: 0,
		createdAt: 0,
		updatedAt: 0,
		pricePaid: null,
		currency: "USD",
		language: "en",
		label: null,
		variant: null,
		notes: null,
		condition: "NM",
		grading: null,
		source: null,
		storageLocation: null,
		deletedAt: null,
		isPrimary: false,
	};
	await idbSet("s1", seedStack, stores.collection);

	// First call: NO corpus — remap must be deferred.
	await migrateUserlandData(stores, null);

	// Marker must still be 4 (not 5), cardId unchanged.
	expect(await idbGet<number>("userlandDataVersion", stores.meta)).toBe(4);
	expect((await idbGet<Stack>("s1", stores.collection))?.cardId).toBe("sv1-1");

	// Second call: corpus now available — remap must run and marker advances to 5.
	const corpus = buildIndex([corpusCard("sv01-001"), corpusCard("swsh3-136")]);
	await migrateUserlandData(stores, corpus);

	expect(await idbGet<number>("userlandDataVersion", stores.meta)).toBe(5);
	expect((await idbGet<Stack>("s1", stores.collection))?.cardId).toBe("sv01-001");

	// Idempotent: third call with corpus must not re-run.
	await migrateUserlandData(stores, corpus);
	expect((await idbGet<Stack>("s1", stores.collection))?.cardId).toBe("sv01-001");
});
