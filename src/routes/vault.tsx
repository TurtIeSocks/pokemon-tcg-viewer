import { ClientOnly, createFileRoute, Outlet } from "@tanstack/react-router";
import { Eyebrow } from "../components/ui/eyebrow";
import { VaultBackupControls } from "../components/vault/vault-backup-controls";
import {
	useOwnedCardCount,
	VaultSummaryHero,
} from "../components/vault/vault-summary";

export { useOwnedCardCount };

export const Route = createFileRoute("/vault")({
	head: () => ({ meta: [{ title: "Your Vault — Pokémon TCG" }] }),
	component: VaultLayout,
});

function VaultHeader() {
	return (
		<div className="mb-6 space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1.5">
					<Eyebrow>Your vault</Eyebrow>
					<h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
						Collection
					</h1>
				</div>
				<VaultBackupControls />
			</div>
			<VaultSummaryHero />
		</div>
	);
}

function VaultLayout() {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-7xl px-4 py-5">
				<ClientOnly
					fallback={
						<h1 className="mb-4 font-display text-3xl font-semibold text-[var(--ink)]">
							Your Vault
						</h1>
					}
				>
					<VaultHeader />
				</ClientOnly>
				<div className="min-h-0 flex-1">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
