import { createFileRoute } from "@tanstack/react-router";

export function HomePlaceholder() {
	return (
		<main className="p-8">
			<h1 className="text-2xl font-bold">Pokémon TCG — Holo Playground</h1>
			<p className="text-muted-foreground">SSR scaffold is live.</p>
		</main>
	);
}

export const Route = createFileRoute("/")({
	component: HomePlaceholder,
});
