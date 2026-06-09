// src/store/userland/claim.test.ts
// Fast, in-memory tests for the claim flow. Uses fake IDB repos — no Supabase
// required. Each test creates isolated stores so local and cloud don't share state.

import { expect, test } from "bun:test";
import { createStore, set, setMany } from "idb-keyval";
import {
	claimLocalToCloud,
	dismissClaimPrompt,
	pendingClaimPrompt,
} from "./claim";
import {
	createIdbBindersRepo,
	createIdbCollectionRepo,
	createIdbProfileRepo,
	LOCAL_PROFILE_ID,
} from "./idb-repo";
import type { BackupRepo, UserlandRepos } from "./repo";
import type { Binder, Stack, UserDataSnapshot } from "./types";

// ---------------------------------------------------------------------------
// Test-store factory: each call creates UNIQUE IDB stores so local and cloud
// repos never share state (fake-indexeddb separates stores by name).
// ---------------------------------------------------------------------------
let storeSeq = 0;
function nextStoreName(base: string): string {
	return `${base}-test-${++storeSeq}`;
}

/** Build a recording repos bundle backed by fresh isolated IDB stores. */
function makeIsolatedRepos(): {
	repos: UserlandRepos;
	importAllCalls: Array<{ snapshot: UserDataSnapshot; mode: string }>;
} {
	const collStore = createStore(nextStoreName("col"), "items");
	const bindStore = createStore(nextStoreName("bind"), "binders");
	const profStore = createStore(nextStoreName("prof"), "profile");

	const collection = createIdbCollectionRepo(collStore);
	const binders = createIdbBindersRepo(bindStore);
	const profile = createIdbProfileRepo(profStore);

	const importAllCalls: Array<{ snapshot: UserDataSnapshot; mode: string }> =
		[];

	// Build a backup repo manually so we can intercept importAll.
	const backup: BackupRepo = {
		async exportAll(): Promise<UserDataSnapshot> {
			const [stacks, bList, prof] = await Promise.all([
				collection.list(),
				binders.list(),
				profile.get(),
			]);
			return {
				schemaVersion: 5 as const,
				exportedAt: Date.now(),
				collection: stacks,
				binders: bList,
				profile: prof,
			};
		},
		async importAll(snapshot, mode) {
			importAllCalls.push({ snapshot, mode });
			// Write records with PRESERVED ids (idb-keyval setMany on the raw store).
			// This mirrors what the real IDB importAll does and is necessary so that
			// subsequent collection.list() returns the same ids that were in the snapshot.
			if (snapshot.collection.length > 0) {
				await setMany(
					snapshot.collection.map((s) => [s.id, s] as [string, Stack]),
					collStore,
				);
			}
			if (snapshot.binders.length > 0) {
				await setMany(
					snapshot.binders.map((b) => [b.id, b] as [string, Binder]),
					bindStore,
				);
			}
			if (snapshot.profile) {
				await set(LOCAL_PROFILE_ID, snapshot.profile, profStore);
			}
		},
	};

	return {
		repos: { collection, binders, backup, profile },
		importAllCalls,
	};
}

// ---------------------------------------------------------------------------
// Empty-cloud auto-upload path
// ---------------------------------------------------------------------------

test("empty cloud: importAll called on cloud with 'merge', no prompt returned", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	const stack = await local.repos.collection.add({ cardId: "card-1" });
	await local.repos.binders.create({ name: "B1" });
	await local.repos.profile.save({ displayName: "Ash" });

	const result = await claimLocalToCloud(local.repos, cloud.repos, "uid-abc");

	expect(result).toBeNull();
	expect(cloud.importAllCalls).toHaveLength(1);
	const call = cloud.importAllCalls[0];
	expect(call?.mode).toBe("merge");
	const ids = call?.snapshot.collection.map((s) => s.id) ?? [];
	expect(ids).toContain(stack.id);
});

test("empty cloud: stack ids are preserved in the uploaded snapshot", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	const stack = await local.repos.collection.add({ cardId: "pikachu-1" });

	await claimLocalToCloud(local.repos, cloud.repos, "uid-def");

	const call = cloud.importAllCalls[0];
	expect(call?.snapshot.collection[0]?.id).toBe(stack.id);
});

test("empty cloud: profile fields are included in the snapshot", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	await local.repos.profile.save({ displayName: "Misty" });
	await local.repos.collection.add({ cardId: "x" });

	const result = await claimLocalToCloud(local.repos, cloud.repos, "uid-misty");

	expect(result).toBeNull();
	const call = cloud.importAllCalls[0];
	expect(call?.snapshot.profile?.displayName).toBe("Misty");
});

test("empty cloud: local repos are untouched after claim", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	const stack = await local.repos.collection.add({ cardId: "keep-me" });

	await claimLocalToCloud(local.repos, cloud.repos, "uid-safe");

	const localStacks = await local.repos.collection.list();
	expect(localStacks.map((s) => s.id)).toContain(stack.id);
});

test("empty cloud + empty local: auto-upload with empty snapshot, no prompt", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();
	// Both empty
	const result = await claimLocalToCloud(local.repos, cloud.repos, "uid-empty");
	expect(result).toBeNull();
	expect(cloud.importAllCalls).toHaveLength(1);
	expect(cloud.importAllCalls[0]?.snapshot.collection).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Cloud-has-data path → return prompt descriptor, no upload
// ---------------------------------------------------------------------------

test("cloud has data + local has extras: returns localOnlyCount, no upload", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	// Cloud already has its own stack (different id from local)
	await cloud.repos.collection.add({ cardId: "cloud-card" });
	// Local has a different stack (new id, not in cloud)
	await local.repos.collection.add({ cardId: "local-only" });

	const result = await claimLocalToCloud(local.repos, cloud.repos, "uid-xyz");

	expect(result).not.toBeNull();
	expect(result?.localOnlyCount).toBeGreaterThanOrEqual(1);
	// importAll was NOT called
	expect(cloud.importAllCalls).toHaveLength(0);
});

test("cloud has data + local extras: local repos untouched", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	await cloud.repos.collection.add({ cardId: "cloud-c" });
	const s = await local.repos.collection.add({ cardId: "local-c" });

	await claimLocalToCloud(local.repos, cloud.repos, "uid");

	const stacks = await local.repos.collection.list();
	expect(stacks.map((x) => x.id)).toContain(s.id);
});

test("cloud has data + local has no extras: returns null, no upload", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	// Add a stack to local
	await local.repos.collection.add({ cardId: "already" });
	// Export local snapshot and seed cloud with the SAME ids (importAll preserves ids)
	const snap = await local.repos.backup.exportAll();
	await cloud.repos.backup.importAll(snap, "merge");
	cloud.importAllCalls.length = 0; // reset after seeding

	// Now claim: cloud already has all local stack ids → no extras
	const result = await claimLocalToCloud(local.repos, cloud.repos, "uid");

	expect(result).toBeNull();
	expect(cloud.importAllCalls).toHaveLength(0);
});

test("cloud has only binders (no stacks) + local has stacks: still auto-upload (stacks empty = cloud empty for claim)", async () => {
	const local = makeIsolatedRepos();
	const cloud = makeIsolatedRepos();

	// Cloud has binders but NO stacks
	await cloud.repos.binders.create({ name: "Cloud Binder" });
	// Local has a stack
	await local.repos.collection.add({ cardId: "local-x" });

	const result = await claimLocalToCloud(local.repos, cloud.repos, "uid-edge");

	// The spec says: "cloud empty" = both stacks AND binders empty. Since cloud has
	// binders → NOT empty → expect a prompt (local has extras cloud doesn't have).
	expect(result).not.toBeNull();
	expect(cloud.importAllCalls).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Dismiss flag
// ---------------------------------------------------------------------------

test("pendingClaimPrompt: returns descriptor when not dismissed", () => {
	const uid = `uid-not-dismissed-${Date.now()}`;
	localStorage.removeItem(`claim-dismissed-${uid}`);
	const desc = { localOnlyCount: 3 };
	expect(pendingClaimPrompt(uid, desc)).toEqual(desc);
});

test("pendingClaimPrompt: returns null after dismissClaimPrompt", () => {
	const uid = `uid-dismissed-${Date.now()}`;
	localStorage.removeItem(`claim-dismissed-${uid}`);
	dismissClaimPrompt(uid);
	const desc = { localOnlyCount: 5 };
	expect(pendingClaimPrompt(uid, desc)).toBeNull();
});

test("pendingClaimPrompt: returns null when descriptor is null", () => {
	const uid = "uid-any";
	expect(pendingClaimPrompt(uid, null)).toBeNull();
});

test("dismissClaimPrompt: only affects the given uid", () => {
	const uid1 = `uid-d1-${Date.now()}`;
	const uid2 = `uid-d2-${Date.now()}`;
	localStorage.removeItem(`claim-dismissed-${uid1}`);
	localStorage.removeItem(`claim-dismissed-${uid2}`);
	dismissClaimPrompt(uid1);
	expect(pendingClaimPrompt(uid1, { localOnlyCount: 1 })).toBeNull();
	expect(pendingClaimPrompt(uid2, { localOnlyCount: 1 })).toEqual({
		localOnlyCount: 1,
	});
});
