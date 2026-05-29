import { Link } from "react-router";
import type { PokemonSet } from "../api";
import "./header.css";

interface HeaderProps {
	currentSet: PokemonSet | undefined;
}

export function Header({ currentSet }: HeaderProps) {
	return (
		<header className="header">
			<h1>Pokémon TCG Holo Playground</h1>
			{currentSet && (
				<div className="set-meta">
					<img src={currentSet.images.logo} alt={currentSet.name} />
					<div>
						<div className="set-name">{currentSet.name}</div>
						<div className="set-sub">
							{currentSet.series} · {currentSet.releaseDate} ·{" "}
							{currentSet.total} cards
						</div>
					</div>
					<Link className="rip-pack-link" to={`/pack/${currentSet.id}`}>
						Rip pack
					</Link>
				</div>
			)}
		</header>
	);
}
