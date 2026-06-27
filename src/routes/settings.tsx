import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CardDatabaseSetting } from "@/components/settings/card-database-setting";
import { Eyebrow } from "@/components/ui/eyebrow";
import { getNavTreeFn } from "../server/nav-tree";

export const Route = createFileRoute("/settings")({
	loader: () => getNavTreeFn(),
	head: () => ({ meta: [{ title: "Settings · Pokémon TCG" }] }),
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-8">
			<header className="flex flex-col gap-1">
				<Eyebrow>SETTINGS</Eyebrow>
				<h1 className="font-display text-3xl">Caching &amp; Offline</h1>
			</header>
			<ClientOnly fallback={null}>
				<CardDatabaseSetting />
			</ClientOnly>
		</div>
	);
}
