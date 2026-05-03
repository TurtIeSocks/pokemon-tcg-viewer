import type { PokemonSet } from "../api";

interface SetTabsProps {
	sets: PokemonSet[];
	selectedSetId: string | null;
	seriesLabel: string | null;
	onSelect: (setId: string) => void;
}

export function SetTabs({
	sets,
	selectedSetId,
	seriesLabel,
	onSelect,
}: SetTabsProps) {
	return (
		<nav
			className="tabs"
			aria-label={seriesLabel ? `${seriesLabel} sets` : "Pokémon TCG sets"}
		>
			{sets.map((s) => (
				<button
					key={s.id}
					type="button"
					className={s.id === selectedSetId ? "tab active" : "tab"}
					onClick={() => onSelect(s.id)}
				>
					<img src={s.images.symbol} alt="" />
					<span>{s.name}</span>
				</button>
			))}
		</nav>
	);
}
