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

// Inlined lucide-style "info" glyph (stroke, 24-grid) so it matches the Menu /
// Package / X icons already in the shell. The Button's `[&_svg]:size-4` sizes it.
function InfoIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</svg>
	);
}

interface Credit {
	title: string;
	body: string;
	href: string;
	linkLabel: string;
}

const CREDITS: Credit[] = [
	{
		title: "Pokémon",
		body: "Pokémon and all related names are trademarks of Nintendo, Creatures Inc., and GAME FREAK inc. This is an unofficial, non-commercial fan project and is not affiliated with, endorsed, or sponsored by them.",
		href: "https://www.pokemon.com",
		linkLabel: "pokemon.com",
	},
	{
		title: "Card data & images",
		body: "All card data and imagery are served by the Pokémon TCG API.",
		href: "https://pokemontcg.io",
		linkLabel: "pokemontcg.io",
	},
	{
		title: "Holographic card effects",
		body: "The holo and foil card shaders are adapted from Pokémon Cards CSS by Simon Goellner (@simeydotme).",
		href: "https://github.com/simeydotme/pokemon-cards-css",
		linkLabel: "simeydotme/pokemon-cards-css",
	},
];

export function AboutDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="About & credits">
					<InfoIcon />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>About</DialogTitle>
					<DialogDescription>
						A fan-made browser for the Pokémon Trading Card Game. With thanks
						to:
					</DialogDescription>
				</DialogHeader>
				<ul className="flex flex-col gap-4">
					{CREDITS.map((credit) => (
						<li key={credit.href} className="flex flex-col gap-1">
							<span className="text-sm font-medium text-foreground">
								{credit.title}
							</span>
							<p className="text-sm text-muted-foreground">{credit.body}</p>
							<a
								href={credit.href}
								target="_blank"
								rel="noreferrer noopener"
								className="text-sm font-medium text-primary underline-offset-4 hover:underline"
							>
								{credit.linkLabel}
							</a>
						</li>
					))}
				</ul>
				<div className="border-t border-border pt-4 text-sm text-muted-foreground">
					Source code:{" "}
					<a
						href={REPO_URL}
						target="_blank"
						rel="noreferrer noopener"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						TurtIeSocks/pokemon-tcg-viewer
					</a>
				</div>
			</DialogContent>
		</Dialog>
	);
}
