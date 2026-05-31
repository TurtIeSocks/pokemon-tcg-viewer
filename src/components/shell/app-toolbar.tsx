import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** SSR-safe top toolbar: brand + Collection link. No browser APIs. */
export function AppToolbar() {
	return (
		<header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
			<Link to="/" aria-label="Pokémon TCG Holo Playground — home" className="flex shrink-0 items-center gap-2">
				<img src="/logo-64.png" alt="" className="size-8 shrink-0" />
				<span className="hidden text-lg font-bold sm:block">Pokémon TCG Holo Playground</span>
			</Link>
			<div className="flex shrink-0 items-center gap-2">
				<Button variant="outline" asChild>
					<Link to="/collection">Collection</Link>
				</Button>
			</div>
		</header>
	);
}
