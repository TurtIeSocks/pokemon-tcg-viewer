import { Link } from "@tanstack/react-router";
import type { NavSet } from "../../server/nav-tree";
import "../booster-pack/booster-pack.css";

/** Non-interactive booster-pack-styled tile that navigates to the set page. */
export function SetTile({
	seriesSlug,
	set,
}: {
	seriesSlug: string;
	set: NavSet;
}) {
	return (
		<Link
			to="/$series/$set"
			params={{ series: seriesSlug, set: set.slug }}
			search={{
				q: "",
				types: [],
				rarity: [],
				supertype: [],
				subtypes: [],
				scope: "all",
				view: "grid",
			}}
			className="booster-pack"
			aria-label={`Browse ${set.name}`}
		>
			<span className="booster-pack-foil" aria-hidden="true" />
			<span className="booster-pack-art">
				<img className="booster-pack-logo" src={set.logo} alt="" />
				<strong className="booster-pack-name">{set.name}</strong>
			</span>
			<img
				className="booster-pack-symbol"
				src={set.symbol}
				alt=""
				aria-hidden="true"
			/>
		</Link>
	);
}
