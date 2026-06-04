import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/vault")({
	head: () => ({ meta: [{ title: "Your Vault — Pokémon TCG" }] }),
	component: VaultLayout,
});

function VaultLayout() {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-7xl px-4 py-5">
				<Outlet />
			</div>
		</div>
	);
}
