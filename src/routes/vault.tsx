import {
	ClientOnly,
	createFileRoute,
	Link,
	Outlet,
} from "@tanstack/react-router";
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

const tabCls = "rounded px-3 py-1.5 text-sm hover:bg-secondary";
function VaultLayout() {
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-y-auto px-4 py-5">
			<ClientOnly
				fallback={<h1 className="mb-4 text-2xl font-bold">Your Vault</h1>}
			>
				<VaultHeader />
			</ClientOnly>
			<nav className="mb-4 flex gap-1 border-b border-border pb-2">
				<Link
					to="/vault/cards"
					className={tabCls}
					activeProps={{ className: `${tabCls} bg-secondary font-medium` }}
				>
					Cards
				</Link>
				<Link
					to="/vault/sets"
					className={tabCls}
					activeProps={{ className: `${tabCls} bg-secondary font-medium` }}
				>
					Sets
				</Link>
				<Link
					to="/vault/goals"
					className={tabCls}
					activeProps={{ className: `${tabCls} bg-secondary font-medium` }}
				>
					Goals
				</Link>
			</nav>
			<div className="min-h-0 flex-1">
				<Outlet />
			</div>
		</div>
	);
}
