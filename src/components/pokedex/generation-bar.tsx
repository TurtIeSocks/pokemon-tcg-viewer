import { Button } from "@/components/ui/button";
import { GENERATIONS, type PokedexRow } from "../../lib/pokedex";

interface GenerationBarProps {
	rows: PokedexRow[];
	onJump: (index: number) => void;
}

/** Gen 1-9 jump pills; scrolls the grid to the first species of a generation. */
export function GenerationBar({ rows, onJump }: GenerationBarProps) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{GENERATIONS.map((g) => {
				const index = rows.findIndex((r) => r.dex >= g.start && r.dex <= g.end);
				return (
					<Button
						key={g.label}
						variant="soft"
						size="sm"
						disabled={index === -1}
						onClick={() => onJump(index)}
					>
						{g.label}
					</Button>
				);
			})}
		</div>
	);
}
