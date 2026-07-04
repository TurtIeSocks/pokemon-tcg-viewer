import { useEffect, useMemo, useState } from "react";
import { ToggleButton, ToggleField } from "@/components/islands/toggle-group";
import { SparkLine } from "@/components/ui/spark-line";
import { epochDayUtc } from "@/lib/corpus/price-history";
import type { CmTuple } from "@/lib/corpus/price-types";
import { loadSetHistory, useCardHistory } from "@/store/corpus/history-runtime";
import { useCardPriceEntry } from "@/store/corpus/prices-runtime";
import type { FocusCardData } from "../../server/card-mappers";

type RangeKey = "30d" | "3m" | "6m" | "1y";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
	{ key: "30d", label: "30D", days: 30 },
	{ key: "3m", label: "3M", days: 90 },
	{ key: "6m", label: "6M", days: 180 },
	{ key: "1y", label: "1Y", days: 365 },
];

interface TrendChip {
	label: string;
	pct: number;
}

/** (trend − avg)/avg as a percent, or null when avg is unavailable/zero. */
function pctChange(trend: number | null, avg: number | null): number | null {
	if (trend === null || avg === null || avg === 0) return null;
	return ((trend - avg) / avg) * 100;
}

function trendChipsFromCm(cm: CmTuple | undefined): TrendChip[] {
	if (!cm) return [];
	const [trend, , avg7, avg30] = cm;
	const chips: TrendChip[] = [];
	const d7 = pctChange(trend, avg7);
	if (d7 !== null) chips.push({ label: "7D", pct: d7 });
	const d30 = pctChange(trend, avg30);
	if (d30 !== null) chips.push({ label: "30D", pct: d30 });
	return chips;
}

function TrendChipView({ chip }: { chip: TrendChip }) {
	const up = chip.pct >= 0;
	const color = up ? "text-(--success)" : "text-(--danger)";
	const sign = up ? "+" : "−";
	return (
		<span
			className={`inline-flex items-center gap-1 font-mono text-[12px] tabular-nums ${color}`}
		>
			<span className="text-[10px] uppercase tracking-[0.1em] text-[var(--faint)]">
				{chip.label}
			</span>
			{sign}
			{Math.abs(chip.pct).toFixed(1)}%
		</span>
	);
}

/**
 * Card price-history chart: a range-filtered `<SparkLine>` of daily
 * representative market points, a 30d/3m/6m/1y range toggle, and
 * cardmarket-derived 7d/30d trend chips. Falls back to a "builds daily" note
 * when the set has fewer than 2 plottable points yet (trend chips still show).
 */
export function CardHistory({ card }: { card: FocusCardData }) {
	const [range, setRange] = useState<RangeKey>("1y");

	useEffect(() => {
		loadSetHistory(card.setId);
	}, [card.setId]);

	const points = useCardHistory(card.id, card.setId);
	const priceEntry = useCardPriceEntry(card.id);

	const rangeDays = RANGES.find((r) => r.key === range)?.days ?? 365;

	const filtered = useMemo(() => {
		if (!points) return [];
		const today = new Date().toISOString().slice(0, 10);
		const todayDay = epochDayUtc(today);
		return points
			.filter(([day]) => todayDay - day <= rangeDays)
			.filter((point): point is [number, number] => point[1] !== null)
			.map(([day, value]) => [day, value] as [number, number]);
	}, [points, rangeDays]);

	const sparse = !points || filtered.length < 2;
	const chips = trendChipsFromCm(priceEntry?.cm);

	return (
		<div className="flex flex-col gap-3">
			<ToggleField aria-label="History range">
				{RANGES.map((r) => (
					<ToggleButton
						key={r.key}
						aria-pressed={range === r.key}
						onClick={() => setRange(r.key)}
					>
						{r.label}
					</ToggleButton>
				))}
			</ToggleField>

			{sparse ? (
				<p className="text-[13px] text-[var(--faint)]">
					Price history builds daily.
				</p>
			) : (
				<SparkLine
					points={filtered}
					width={280}
					height={72}
					label="Price history"
				/>
			)}

			{chips.length > 0 ? (
				<div className="flex items-center gap-4">
					{chips.map((chip) => (
						<TrendChipView key={chip.label} chip={chip} />
					))}
				</div>
			) : null}
		</div>
	);
}
