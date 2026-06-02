import { ClientOnly, createFileRoute, Outlet } from "@tanstack/react-router";
import { VaultBackupControls } from "../components/vault/vault-backup-controls";
import { useOwnedCardCount } from "../components/vault/vault-summary";

export const Route = createFileRoute("/vault")({
	head: () => ({ meta: [{ title: "Your Vault — Pokémon TCG" }] }),
	component: VaultLayout,
});

function VaultHeader() {
	const count = useOwnedCardCount();
	return (
		<div className="mb-4 flex flex-wrap items-center gap-3">
			<h1 className="text-2xl font-bold">Your Vault</h1>
			<span className="text-sm text-muted-foreground">{count} cards</span>
			<div className="ml-auto">
				<VaultBackupControls />
			</div>
		</div>
	);
}

function VaultLayout() {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-7xl px-4 py-5">
				<ClientOnly
					fallback={<h1 className="mb-4 text-2xl font-bold">Your Vault</h1>}
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
