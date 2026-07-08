import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { variantLabel } from "../../lib/card-variants";
import type { FocusCardData } from "../../server/card-mappers";
import { EnergyIcon } from "./energy-icon";

/**
 * Shared identity header for the card focus view: the name, the human
 * descriptor, a rarity badge, and the set · # line. Rendered by both the modal
 * (inside `DialogHeader`) and the dedicated page wrapper (`CardPageView`) so the
 * two surfaces stay in sync. Presentational — a11y title semantics live in the
 * consumer (the modal supplies a `DialogTitle`).
 */
export function CardHeading({ card }: { card: FocusCardData }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
				<h1 className="font-display text-lg font-semibold leading-tight text-[var(--ink)]">
					{card.name}
				</h1>
				{card.rarity ? (
					<Badge variant="default" className="shrink-0 self-center">
						✦ {card.rarity}
					</Badge>
				) : null}
			</div>
			<div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
				{card.supertype} · {card.setName} · #{card.cardNumber}
			</div>
		</div>
	);
}

const SECTION =
	"mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--faint)]";
const CAPTION =
	"mt-1.5 font-mono text-[11px] leading-relaxed text-[var(--ink-muted)]";

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
				<span className="rounded border border-[var(--primary)]/40 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--primary)]">
					{ability.type}
				</span>
				<span className="font-display text-base">{ability.name}</span>
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
				<span className="inline-flex items-center font-display text-base">
					{attack.name}
					{attack.cost?.length ? (
						<EnergyRow cost={attack.cost} label="Cost" />
					) : null}
				</span>
				{attack.damage ? (
					<span className="shrink-0 font-mono text-[17px] font-bold text-[color:var(--primary)]">
						{attack.damage}
					</span>
				) : null}
			</div>
			{attack.text ? <p className={CAPTION}>{attack.text}</p> : null}
		</div>
	);
}

/** A stat term (Weak / Resist) rendered as its type glyph(s) + value, matching
 * the energy-icon language used everywhere else instead of spelling the type. */
function StatTypes({
	label,
	items,
}: {
	label: string;
	items: { type: string; value: string }[];
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{label}
			{items.map((it, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: static read-only list that may repeat a type
					key={`${it.type}-${i}`}
					className="inline-flex items-center gap-1"
				>
					<EnergyIcon type={it.type} size={16} />
					<b className="font-medium text-[var(--ink-muted)]">{it.value}</b>
				</span>
			))}
		</span>
	);
}

function StatStrip({ card }: { card: FocusCardData }) {
	const hasWeak = !!card.weaknesses?.length;
	const hasResist = !!card.resistances?.length;
	const hasRetreat = !!card.retreatCost?.length;
	if (!hasWeak && !hasResist && !hasRetreat && !card.artist) return null;
	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-3.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--ink-muted)]">
			{hasWeak && card.weaknesses ? (
				<StatTypes label="Weak" items={card.weaknesses} />
			) : null}
			{hasResist && card.resistances ? (
				<StatTypes label="Resist" items={card.resistances} />
			) : null}
			{hasRetreat && card.retreatCost ? (
				<span className="inline-flex items-center">
					Retreat
					<EnergyRow cost={card.retreatCost} label="Retreat" />
				</span>
			) : null}
			{card.artist ? (
				<span>
					Illus.{" "}
					<b className="font-medium text-[var(--ink-muted)]">{card.artist}</b>
				</span>
			) : null}
		</div>
	);
}

/** Shimmer body shown while the battle stats are still loading (optimistic card). */
function BodyGhost() {
	return (
		<div aria-hidden="true">
			<div className={SECTION}>
				<Skeleton className="h-2.5 w-16" />
			</div>
			{["a", "b"].map((k) => (
				<div key={k} className="border-t border-white/[0.07] py-3">
					<div className="flex items-center justify-between gap-3">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-10" />
					</div>
					<Skeleton className="mt-2 h-3 w-full" />
					<Skeleton className="mt-1.5 h-3 w-3/5" />
				</div>
			))}
		</div>
	);
}

/** Shimmer stand-in for the weak/resist/retreat strip while detail loads. */
function StatStripGhost() {
	return (
		<div
			className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-3.5"
			aria-hidden="true"
		>
			<Skeleton className="h-3 w-24" />
			<Skeleton className="h-3 w-20" />
			<Skeleton className="h-3 w-16" />
		</div>
	);
}

/**
 * Top meta block for the Details tab: the structured descriptors (subtype, type,
 * evolves-from) pulled OUT of the dense identity heading into a clean labeled
 * strip above the Ability/Attacks body. Renders nothing when a card has none.
 */
function CardMetaStrip({ card }: { card: FocusCardData }) {
	const items: { label: string; value: string }[] = [];
	if (card.subtypes?.length)
		items.push({ label: "Subtype", value: card.subtypes.join(" ") });
	if (card.types?.length)
		items.push({ label: "Type", value: card.types.join(" / ") });
	if (card.evolvesFrom)
		items.push({ label: "Evolves from", value: card.evolvesFrom });
	// Each printing is its own record (edition/stamp/subtype differ), so render one
	// chip per printing — a flat " · " join erased the boundaries and made the
	// shared "Holo" type read as a duplicate. Collapse only printings that humanize
	// to the exact same label (genuine dupes).
	const seen = new Set<string>();
	const printings: { id: string; label: string }[] = [];
	for (const v of card.variantsDetailed ?? []) {
		const label = variantLabel(v);
		if (seen.has(label)) continue;
		seen.add(label);
		printings.push({ id: v.variantId, label });
	}
	if (!items.length && !printings.length) return null;
	return (
		<div className="flex flex-col gap-2.5 border-b border-white/[0.07] pb-3.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--ink-muted)]">
			{items.length ? (
				<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
					{items.map((it) => (
						<span key={it.label}>
							{it.label}{" "}
							<b className="font-medium text-[var(--ink)]">{it.value}</b>
						</span>
					))}
				</div>
			) : null}
			{printings.length ? (
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
					<span>Printings</span>
					{printings.map((p) => (
						<span
							key={p.id}
							className="rounded-[var(--r-pill)] border border-white/10 bg-white/[0.05] px-2 py-0.5 tracking-[0.08em] text-[var(--ink)]"
						>
							{p.label}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

/**
 * The info column of the card focus view: a top meta strip (subtype / type /
 * evolves-from), a growing body (abilities / attacks / rules / flavor) and a
 * stat strip (weak / resist / retreat / illustrator). The identity header lives
 * in {@link CardHeading}, rendered by the consumer.
 *
 * `pending` (only the optimistic corpus card is shown, detail still loading)
 * swaps the detail-only regions — body + stat strip — for shimmer ghosts.
 */
export function CardInfo({
	card,
	pending,
}: {
	card: FocusCardData;
	pending?: boolean;
}) {
	const hasAbilities = !!card.abilities?.length;
	const hasAttacks = !!card.attacks?.length;
	const hasRules = !!card.rules?.length;
	const emptyBody = !hasAbilities && !hasAttacks && !hasRules;
	return (
		<div className="flex min-w-0 flex-1 flex-col text-[var(--ink)]">
			<div className="flex-1">
				<CardMetaStrip card={card} />
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

				{card.flavorText ? (
					<p className="mt-4 border-t border-white/[0.07] pt-3 font-display text-[13px] italic leading-relaxed text-[var(--ink-muted)]">
						{card.flavorText}
					</p>
				) : pending ? (
					<div
						aria-hidden="true"
						className="mt-4 border-t border-white/[0.07] pt-3"
					>
						<Skeleton className="h-3 w-full" />
						<Skeleton className="mt-1.5 h-3 w-4/5" />
					</div>
				) : null}

				{emptyBody && pending ? <BodyGhost /> : null}
			</div>

			<div>{pending ? <StatStripGhost /> : <StatStrip card={card} />}</div>
		</div>
	);
}
