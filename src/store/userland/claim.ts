// src/store/userland/claim.ts
//
// First-sign-in local→cloud claim.
//
// Rules:
//   • Cloud empty (no stacks, no binders) → auto-upload via exportAll/importAll.
//     uuidv7 ids carry over. Profile fields are upserted under the auth uid
//     (the local "me" id is dropped — importAll in supabase-repo already remaps it).
//   • Cloud has data + local has extras → return a prompt descriptor {localOnlyCount}
//     containing the count of local stack ids absent from cloud. No upload.
//   • Dismiss flag: localStorage key `claim-dismissed-<uid>` suppresses re-prompts.
//   • Local IDB is NEVER mutated or deleted.

import type { UserlandRepos } from "./repo";

/** Descriptor returned when cloud already has data and local has extras the user hasn't uploaded. */
export interface ClaimPrompt {
	localOnlyCount: number;
}

/** localStorage key used to remember that the user dismissed the claim prompt for a given uid. */
function dismissKey(uid: string): string {
	return `claim-dismissed-${uid}`;
}

/**
 * Attempt to claim local IDB data to the cloud Vault for `uid`.
 *
 * - Cloud empty → calls `localRepos.backup.exportAll()` then
 *   `cloudRepos.backup.importAll(snapshot, "merge")`. Profile fields are written
 *   under the auth uid (the Supabase importAll already remaps the "me" id).
 *   Returns `null` (nothing to prompt about).
 *
 * - Cloud has data + local has stacks absent from cloud → returns a `ClaimPrompt`
 *   with the count of stack ids that are in local but not in cloud.
 *
 * - Cloud has data, local has no extras → returns `null` (already synced).
 *
 * Local repos are never modified.
 */
export async function claimLocalToCloud(
	localRepos: UserlandRepos,
	cloudRepos: UserlandRepos,
	// uid is reserved: used by callers to dismiss/check per-account flags (see pendingClaimPrompt)
	_uid: string,
): Promise<ClaimPrompt | null> {
	// Fetch cloud state (empty check)
	const [cloudStacks, cloudBinders] = await Promise.all([
		cloudRepos.collection.list(),
		cloudRepos.binders.list(),
	]);

	const cloudEmpty = cloudStacks.length === 0 && cloudBinders.length === 0;

	if (cloudEmpty) {
		// Auto-upload path: export local, import to cloud.
		const snapshot = await localRepos.backup.exportAll();
		await cloudRepos.backup.importAll(snapshot, "merge");
		return null;
	}

	// Cloud has data — compute how many local stack ids are absent from cloud.
	const localStacks = await localRepos.collection.list();
	if (localStacks.length === 0) {
		// No local stacks to worry about.
		return null;
	}

	const cloudStackIdSet = new Set(cloudStacks.map((s) => s.id));
	const localOnlyCount = localStacks.filter(
		(s) => !cloudStackIdSet.has(s.id),
	).length;

	if (localOnlyCount === 0) {
		return null;
	}

	return { localOnlyCount };
}

/**
 * Returns the pending claim prompt for `uid` if one exists and hasn't been
 * dismissed, otherwise `null`.
 *
 * Callers should invoke `claimLocalToCloud` first to get a fresh descriptor,
 * then gate display on `pendingClaimPrompt` to suppress repeat prompts.
 */
export function pendingClaimPrompt(
	uid: string,
	descriptor: ClaimPrompt | null,
): ClaimPrompt | null {
	if (!descriptor) return null;
	try {
		if (
			typeof localStorage !== "undefined" &&
			localStorage.getItem(dismissKey(uid))
		) {
			return null;
		}
	} catch {
		// SSR / environments without localStorage — treat as not dismissed
	}
	return descriptor;
}

/**
 * Record that the user dismissed the claim prompt for `uid`.
 * After this, `pendingClaimPrompt(uid, ...)` always returns null.
 */
export function dismissClaimPrompt(uid: string): void {
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(dismissKey(uid), "1");
		}
	} catch {
		// SSR / environments without localStorage — no-op
	}
}
