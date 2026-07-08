import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

const REPO_URL = "https://github.com/TurtIeSocks/pokemon-tcg-viewer";

interface Credit {
	title: string;
	body: string;
	href: string;
	linkLabel: string;
}

const CREDITS: Credit[] = [
	{
		title: "Pokémon",
		body: "Pokémon and all related names are trademarks of Nintendo, Creatures Inc., and GAME FREAK inc. Cardstack is an unofficial, non-commercial fan project. It is not affiliated with, endorsed, or sponsored by them.",
		href: "https://www.pokemon.com",
		linkLabel: "pokemon.com",
	},
	{
		title: "Card data & images",
		body: "Every card you browse and collect is served by the Pokémon TCG API.",
		href: "https://pokemontcg.io",
		linkLabel: "pokemontcg.io",
	},
	{
		title: "Holographic card effects",
		body: "The holo and foil shaders that make the chase cards glint are adapted from Pokémon Cards CSS by Simon Goellner (@simeydotme).",
		href: "https://github.com/simeydotme/pokemon-cards-css",
		linkLabel: "simeydotme/pokemon-cards-css",
	},
];

export function AboutDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="About & credits">
					<Info aria-hidden="true" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">About Cardstack</DialogTitle>
					<DialogDescription>
						Cardstack is a fan-made, open-source collection manager for the
						Pokémon TCG. Local-first, your data, no ads, no snooping. Built by
						collectors, with thanks to:
					</DialogDescription>
				</DialogHeader>
				<ul className="flex flex-col gap-4">
					{CREDITS.map((credit) => (
						<li
							key={credit.href}
							className="flex flex-col gap-1 rounded-(--r-control) border border-(--hairline) bg-(--glass) px-3 py-2.5"
						>
							<span className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
								{credit.title}
							</span>
							<p className="text-sm text-(--ink-muted)">{credit.body}</p>
							<a
								href={credit.href}
								target="_blank"
								rel="noreferrer noopener"
								className="text-sm font-medium text-(--primary) underline-offset-4 hover:underline"
							>
								{credit.linkLabel}
							</a>
						</li>
					))}
				</ul>
				<div className="border-t border-(--border) pt-4 text-sm text-(--ink-muted)">
					Open source, top to bottom. No landlord, no lock-in.{" "}
					<a
						href={REPO_URL}
						target="_blank"
						rel="noreferrer noopener"
						className="font-medium text-(--primary) underline-offset-4 hover:underline"
					>
						View source on GitHub
					</a>
				</div>
			</DialogContent>
		</Dialog>
	);
}
