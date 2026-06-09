// src/components/vault/claim-prompt.tsx
//
// Banner shown when a signed-in user has local-only stacks not yet in their
// cloud Vault. Appears after the first-sign-in claim detects existing cloud data.
// Gated on isCloudEnabled() — never renders in pure local-first mode.

import { getBrowserClient, isCloudEnabled } from "@/lib/supabase/client";
import { dismissClaimPrompt, importLocalExtras } from "@/store/userland/claim";
import { getRepos } from "@/store/userland/idb-repo";
import { createSupabaseRepo } from "@/store/userland/supabase-repo";
import { loadUserland, useUserland } from "@/store/userland/userland-store";

/**
 * Dismiss the prompt in state and persist the dismiss flag so it doesn't
 * re-appear on future sign-ins.
 */
function handleDismiss(uid: string): void {
	dismissClaimPrompt(uid);
	useUserland.setState({ claimPrompt: null });
}

/**
 * Import local-only extras to cloud, then force-refresh the store and clear
 * the prompt.
 */
async function handleImport(uid: string): Promise<void> {
	const localRepos = getRepos();
	const cloudRepos = createSupabaseRepo(getBrowserClient());
	await importLocalExtras(localRepos, cloudRepos);
	// Force-refresh: bypass the hydrated guard so the newly-imported data lands.
	useUserland.setState({ hydrated: false });
	await loadUserland();
	dismissClaimPrompt(uid);
	useUserland.setState({ claimPrompt: null });
}

/** Banner shown when cloud already had data and local has extras not yet uploaded. */
export function ClaimPromptBanner() {
	const claimPrompt = useUserland((s) => s.claimPrompt);

	if (!isCloudEnabled() || !claimPrompt) return null;

	const client = getBrowserClient();
	// We read the session synchronously from the memoised client — it's safe
	// because this banner only renders after SIGNED_IN completed.
	let uid = "";
	try {
		// getSession() is async but the session is already cached in memory after
		// subscribeAuth ran. Access the cached value directly.
		const sess = (
			client.auth as unknown as {
				currentSession?: { user: { id: string } } | null;
			}
		).currentSession;
		uid = sess?.user.id ?? "";
	} catch {
		// Fallback: banner still works, dismiss key just won't be uid-scoped.
	}

	const { localOnlyCount } = claimPrompt;

	return (
		<div
			role="status"
			aria-live="polite"
			className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-panel)] border border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur-xl"
		>
			<p className="text-sm text-[var(--ink)]">
				You have{" "}
				<span className="font-mono tabular-nums font-semibold">
					{localOnlyCount}
				</span>{" "}
				local {localOnlyCount === 1 ? "card" : "cards"} not in your cloud Vault.
			</p>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => {
						void handleImport(uid);
					}}
					className="rounded-[var(--r-pill)] bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
				>
					Import
				</button>
				<button
					type="button"
					onClick={() => handleDismiss(uid)}
					className="rounded-[var(--r-pill)] border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
