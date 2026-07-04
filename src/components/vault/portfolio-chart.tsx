import { SparkLine } from "@/components/ui/spark-line";
import { epochDayUtc } from "@/lib/corpus/price-history";
import { formatPrice } from "@/store/userland/money";
import { useSnapshots } from "@/store/userland/userland-store";
import { useHideValue } from "@/store/userland/valuation-hooks";

const MASK = "•••";

/**
 * Vault hero portfolio value-over-time chart: a `<SparkLine>` of daily
 * snapshot totals (T2's `useSnapshots`), with a header showing the latest
 * value. Masked ("•••", no chart) when the collector has hidden values.
 * Falls back to a "builds daily" note until at least 2 snapshots exist.
 */
export function PortfolioChart() {
	const snaps = useSnapshots();
	const hidden = useHideValue();

	if (hidden) {
		return (
			<div className="flex flex-col gap-2">
				<span className="text-[10px] uppercase tracking-[0.10em] text-[var(--faint)]">
					Portfolio value
				</span>
				<span className="font-mono text-[15px] tabular-nums text-[var(--ink)]">
					{MASK}
				</span>
			</div>
		);
	}

	if (snaps.length < 2) {
		return (
			<p className="text-[13px] text-[var(--faint)]">
				Portfolio history builds daily.
			</p>
		);
	}

	const points = snaps.map(
		(s) => [epochDayUtc(s.priceDate), s.totalCents] as [number, number],
	);
	const latest = snaps.at(-1);
	// biome-ignore lint/style/noNonNullAssertion: length >= 2 checked above
	const latestValue = formatPrice(latest!.totalCents, latest!.currency);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-[10px] uppercase tracking-[0.10em] text-[var(--faint)]">
					Portfolio value
				</span>
				<span className="font-mono text-[15px] tabular-nums text-[var(--ink)]">
					{latestValue}
				</span>
			</div>
			<SparkLine
				points={points}
				width={280}
				height={56}
				label="Portfolio value"
			/>
		</div>
	);
}
