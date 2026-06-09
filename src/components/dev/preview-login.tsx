"use client";

import { useState } from "react";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { getBrowserClient, isCloudEnabled } from "@/lib/supabase/client";
import { loadCorpus, useCorpusRuntime } from "@/store/corpus/corpus-runtime";
import {
	addCardsToBinder,
	addRuleToBinder,
	addStacks,
	clearCollection,
	createBinder,
	removeBinder,
	useUserland,
} from "@/store/userland/userland-store";
import { generateSeedBinders, generateSeedStacks } from "./seed-data";

// Renders ONLY when VITE_CLAUDE_PREVIEW is set — that flag is set exclusively by
// the Claude-preview launch config (`.claude/launch.json` → `dev:preview`), so a
// production build never sets it, the gate below is statically `false`, and Vite
// dead-code-eliminates this whole component (and seed-data.ts) out of the prod
// bundle.
const IS_PREVIEW = import.meta.env.VITE_CLAUDE_PREVIEW === "true";

// Local-only dev credentials. The user exists solely in the local Supabase
// stack; `enable_confirmations = false` (config.toml) means `signUp` immediately
// yields a usable session — no email round-trip. NEVER put real/secret creds here.
const DEV_EMAIL = "preview@local.dev";
const DEV_PASSWORD = "preview-dev-only-password";

/** A floating dev-only panel: throwaway sign-in + an RNG machine that seeds data. */
export function PreviewLogin() {
	if (!IS_PREVIEW || !isCloudEnabled()) return null;
	return <PreviewLoginPanel />;
}

function clampCount(n: number): number {
	return Number.isFinite(n) ? Math.min(200, Math.max(1, Math.floor(n))) : 1;
}

function PreviewLoginPanel() {
	const { session, email } = useAuthSession();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [cardCount, setCardCount] = useState(25);
	const [seeding, setSeeding] = useState(false);
	const [seedMsg, setSeedMsg] = useState<string | null>(null);

	async function devSignIn() {
		setBusy(true);
		setError(null);
		const auth = getBrowserClient().auth;
		// Existing dev user → straight in. First run → sign up (auto-confirmed
		// locally, returns a session) and fall back to password sign-in if needed.
		const signIn = await auth.signInWithPassword({
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
		});
		if (signIn.error) {
			const created = await auth.signUp({
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
			if (created.error) {
				setError(created.error.message);
			} else if (!created.data.session) {
				const retry = await auth.signInWithPassword({
					email: DEV_EMAIL,
					password: DEV_PASSWORD,
				});
				if (retry.error) setError(retry.error.message);
			}
		}
		setBusy(false);
	}

	async function devSignOut() {
		setBusy(true);
		setError(null);
		await getBrowserClient().auth.signOut();
		setBusy(false);
	}

	/** Seed the active Vault with random stacks + binders (appends). */
	async function seed() {
		setSeeding(true);
		setSeedMsg(null);
		setError(null);
		try {
			await loadCorpus();
			const index = useCorpusRuntime.getState().index;
			if (!index || index.cards.length === 0) {
				setError("Corpus not loaded yet — try again.");
				return;
			}
			const stacks = generateSeedStacks(index.cards, cardCount, Date.now());
			const created = await addStacks(stacks);
			const ownedIds = created.map((s) => s.cardId);
			const binderCount = Math.min(6, Math.max(2, Math.ceil(cardCount / 6)));
			const plans = generateSeedBinders(ownedIds, index.cards, binderCount);
			for (const plan of plans) {
				const binder = await createBinder({
					name: plan.name,
					description: plan.description,
				});
				if (plan.query) {
					await addRuleToBinder(binder.id, plan.query);
				} else if (plan.cardIds.length > 0) {
					await addCardsToBinder(binder.id, plan.cardIds);
				}
			}
			setSeedMsg(`seeded ${created.length} cards · ${plans.length} binders`);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSeeding(false);
		}
	}

	/** Wipe all stacks + binders from the active Vault (leaves the profile). */
	async function clearVault() {
		setSeeding(true);
		setSeedMsg(null);
		setError(null);
		try {
			await clearCollection();
			const ids = Object.keys(useUserland.getState().binders);
			for (const id of ids) await removeBinder(id);
			setSeedMsg("vault cleared");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSeeding(false);
		}
	}

	return (
		<div className="fixed right-3 bottom-3 z-[9999] w-56 rounded-lg border border-amber-400/40 bg-black/85 p-2.5 font-mono text-[11px] text-amber-200 shadow-lg backdrop-blur">
			<div className="mb-1.5 flex items-center gap-1 font-semibold uppercase tracking-wide text-amber-300">
				<span aria-hidden>⚙</span> preview login
			</div>
			{session ? (
				<div className="space-y-1.5">
					<div className="truncate text-amber-100/70">
						signed in: {email ?? DEV_EMAIL}
					</div>
					<button
						type="button"
						onClick={devSignOut}
						disabled={busy}
						className="w-full rounded border border-amber-400/40 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-50"
					>
						{busy ? "…" : "Sign out"}
					</button>
				</div>
			) : (
				<button
					type="button"
					onClick={devSignIn}
					disabled={busy}
					className="w-full rounded border border-amber-400/40 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-50"
				>
					{busy ? "Signing in…" : "Sign in as dev user"}
				</button>
			)}

			{/* RNG machine — seeds the active Vault with random data. */}
			<div className="mt-2.5 border-amber-400/20 border-t pt-2">
				<div className="mb-1.5 flex items-center gap-1 font-semibold text-amber-300 uppercase tracking-wide">
					<span aria-hidden>🎲</span> rng machine
				</div>
				<label className="mb-1.5 flex items-center justify-between gap-2">
					<span className="text-amber-100/70">cards</span>
					<input
						type="number"
						min={1}
						max={200}
						value={cardCount}
						onChange={(e) => setCardCount(clampCount(e.target.valueAsNumber))}
						disabled={seeding}
						className="w-16 rounded border border-amber-400/40 bg-black/40 px-1.5 py-0.5 text-right text-amber-100 outline-none disabled:opacity-50"
					/>
				</label>
				<div className="flex gap-1.5">
					<button
						type="button"
						onClick={seed}
						disabled={seeding}
						className="flex-1 rounded border border-amber-400/40 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-50"
					>
						{seeding ? "…" : "Seed"}
					</button>
					<button
						type="button"
						onClick={clearVault}
						disabled={seeding}
						className="flex-1 rounded border border-red-400/40 px-2 py-1 text-red-200 hover:bg-red-400/10 disabled:opacity-50"
					>
						Clear
					</button>
				</div>
				{seedMsg && <div className="mt-1.5 text-emerald-300/80">{seedMsg}</div>}
			</div>

			{error && <div className="mt-1.5 text-red-300">{error}</div>}
		</div>
	);
}
