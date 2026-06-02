import type { ReactNode } from "react";
import type { FocusCardData } from "../../server/card-mappers";
import { EnergyIcon } from "./energy-icon";

/** Human descriptor line, e.g. "Stage 1 Pokémon · Lightning · Evolves from Pikachu". */
function describe(card: FocusCardData): string {
	const isPokemon = card.supertype === "Pokémon";
	const parts: string[] = [];
	if (isPokemon) {
		const lead = [card.subtypes?.join(" "), card.supertype]
			.filter(Boolean)
			.join(" ");
		parts.push(lead);
		if (card.types?.length) parts.push(card.types.join(" / "));
		if (card.evolvesFrom) parts.push(`Evolves from ${card.evolvesFrom}`);
	} else {
		parts.push(card.supertype);
		if (card.subtypes?.length) parts.push(card.subtypes.join(", "));
	}
	return parts.join(" · ");
}

const SECTION =
	"mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#6a665c]";
const CAPTION = "mt-1.5 font-mono text-[11px] leading-relaxed text-[#88857b]";

function EnergyRow({ cost, label }: { cost: string[]; label: string }) {
	return (
		<span
			role="img"
			className="ml-2 inline-flex gap-[3px] align-middle"
			aria-label={`${label}: ${cost.join(", ")}`}
		>
			{cost.map((c, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static read-only energy list that may repeat a type (e.g. Colorless, Colorless)
				<EnergyIcon key={`${c}-${i}`} type={c} size={18} />
			))}
		</span>
	);
}

function AbilityRow({
	ability,
}: {
	ability: NonNullable<FocusCardData["abilities"]>[number];
}) {
	return (
		<div className="border-t border-white/[0.07] py-3">
			<div className="flex items-center gap-2">
				<span className="rounded border border-[#f85888]/40 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#f85888]">
					{ability.type}
				</span>
				<span className="font-serif text-base">{ability.name}</span>
			</div>
			{ability.text ? <p className={CAPTION}>{ability.text}</p> : null}
		</div>
	);
}

function AttackRow({
	attack,
}: {
	attack: NonNullable<FocusCardData["attacks"]>[number];
}) {
	return (
		<div className="border-t border-white/[0.07] py-3 last:border-b">
			<div className="flex items-center justify-between gap-3">
				<span className="inline-flex items-center font-serif text-base">
					{attack.name}
					{attack.cost?.length ? (
						<EnergyRow cost={attack.cost} label="Cost" />
					) : null}
				</span>
				{attack.damage ? (
					<span className="shrink-0 font-mono text-[17px] font-bold text-[color:var(--accent,#c9a86a)]">
						{attack.damage}
					</span>
				) : null}
			</div>
			{attack.text ? <p className={CAPTION}>{attack.text}</p> : null}
		</div>
	);
}

function StatStrip({ card }: { card: FocusCardData }) {
	const hasWeak = !!card.weaknesses?.length;
	const hasResist = !!card.resistances?.length;
	const hasRetreat = !!card.retreatCost?.length;
	if (!hasWeak && !hasResist && !hasRetreat && !card.artist) return null;
	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-3.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[#7d7a70]">
			{hasWeak ? (
				<span>
					Weak{" "}
					<b className="font-medium text-[#cfcabd]">
						{card.weaknesses?.map((w) => `${w.type} ${w.value}`).join(", ")}
					</b>
				</span>
			) : null}
			{hasResist ? (
				<span>
					Resist{" "}
					<b className="font-medium text-[#cfcabd]">
						{card.resistances?.map((r) => `${r.type} ${r.value}`).join(", ")}
					</b>
				</span>
			) : null}
			{hasRetreat && card.retreatCost ? (
				<span className="inline-flex items-center">
					Retreat
					<EnergyRow cost={card.retreatCost} label="Retreat" />
				</span>
			) : null}
			{card.artist ? (
				<span>
					Illus. <b className="font-medium text-[#cfcabd]">{card.artist}</b>
				</span>
			) : null}
		</div>
	);
}

/**
 * The info column of the card focus view: kicker, header (name + HP),
 * descriptor, a growing body (abilities / attacks / rules), and a bottom
 * group (stat strip + the `footer` slot for prices + cross-links) that
 * stays aligned to the bottom of the card plate.
 */
export function CardInfo({
	card,
	footer,
}: {
	card: FocusCardData;
	footer?: ReactNode;
}) {
	const hasAbilities = !!card.abilities?.length;
	const hasAttacks = !!card.attacks?.length;
	const hasRules = !!card.rules?.length;
	return (
		<div className="flex min-w-0 flex-1 flex-col text-[#e7e3d8]">
			<div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#7d7a70]">
				{card.setName} · #{card.cardNumber}
				{card.rarity ? ` · ${card.rarity}` : ""}
			</div>

			<div className="mt-1.5 flex items-baseline justify-between gap-3.5">
				<h2 className="font-serif text-[2.5rem] font-light leading-none tracking-[-0.01em]">
					{card.name}
				</h2>
				{card.hp ? (
					<span className="shrink-0 whitespace-nowrap font-mono text-sm text-[#7d7a70]">
						<b className="text-[1.4rem] font-bold text-[color:var(--accent,#c9a86a)]">
							{card.hp}
						</b>{" "}
						HP
					</span>
				) : null}
			</div>
			<div className="font-serif text-sm text-[#9c988c]">{describe(card)}</div>

			<div className="flex-1">
				{hasAbilities ? (
					<>
						<div className={SECTION}>
							{card.abilities && card.abilities.length > 1
								? "Abilities"
								: "Ability"}
						</div>
						{card.abilities?.map((a) => (
							<AbilityRow key={a.name} ability={a} />
						))}
					</>
				) : null}

				{hasAttacks ? (
					<>
						<div className={SECTION}>Attacks</div>
						{card.attacks?.map((atk) => (
							<AttackRow key={atk.name} attack={atk} />
						))}
					</>
				) : null}

				{hasRules ? (
					<>
						<div className={SECTION}>Rules</div>
						{card.rules?.map((r) => (
							<p key={r} className={CAPTION}>
								{r}
							</p>
						))}
					</>
				) : null}
			</div>

			<div>
				<StatStrip card={card} />
				{footer ? (
					<div className="mt-4 border-t border-white/[0.07] pt-3.5">
						{footer}
					</div>
				) : null}
			</div>
		</div>
	);
}
