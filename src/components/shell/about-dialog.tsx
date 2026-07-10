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
import { m } from "@/paraglide/messages";

const REPO_URL = "https://github.com/TurtIeSocks/pokemon-tcg-viewer";

interface Credit {
	/** Thunk, not a plain string — see {@link NavDestination.label} in command-palette-data.ts. */
	title: () => string;
	body: () => string;
	href: string;
	linkLabel: string;
}

const CREDITS: Credit[] = [
	{
		title: () => m.shell_credit_pokemon_title(),
		body: () => m.shell_credit_pokemon_body(),
		href: "https://www.pokemon.com",
		linkLabel: "pokemon.com",
	},
	{
		title: () => m.shell_credit_card_data_title(),
		body: () => m.shell_credit_card_data_body(),
		href: "https://tcgdex.dev",
		linkLabel: "tcgdex.dev",
	},
	{
		title: () => m.shell_credit_pricing_title(),
		body: () => m.shell_credit_pricing_body(),
		href: "https://pokemontcg.io",
		linkLabel: "pokemontcg.io",
	},
	{
		title: () => m.shell_credit_holo_title(),
		body: () => m.shell_credit_holo_body(),
		href: "https://github.com/simeydotme/pokemon-cards-css",
		linkLabel: "simeydotme/pokemon-cards-css",
	},
	{
		title: () => m.shell_credit_fonts_title(),
		body: () => m.shell_credit_fonts_body(),
		href: "https://www.fontshare.com",
		linkLabel: "Fontshare",
	},
];

export function AboutDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={m.shell_about_credits_aria()}
				>
					<Info aria-hidden="true" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						{m.shell_about_title()}
					</DialogTitle>
					<DialogDescription>{m.shell_about_description()}</DialogDescription>
				</DialogHeader>
				<ul className="flex flex-col gap-4">
					{CREDITS.map((credit) => (
						<li
							key={credit.href}
							className="flex flex-col gap-1 rounded-(--r-control) border border-(--hairline) bg-(--glass) px-3 py-2.5"
						>
							<span className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
								{credit.title()}
							</span>
							<p className="text-sm text-(--ink-muted)">{credit.body()}</p>
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
					{m.shell_open_source_note()}{" "}
					<a
						href={REPO_URL}
						target="_blank"
						rel="noreferrer noopener"
						className="font-medium text-(--primary) underline-offset-4 hover:underline"
					>
						{m.shell_view_source_github()}
					</a>
				</div>
			</DialogContent>
		</Dialog>
	);
}
