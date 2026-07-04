import { Stat } from "@/components/ui/stat";
import { formatPrice, formatSignedPrice } from "@/store/userland/money";
import type { CollectionStats } from "@/store/userland/stats";
import { useCollectionStats } from "@/store/userland/stats";
import { useHideValue } from "@/store/userland/valuation-hooks";

const MASK = "•••";
const DASH = "—";
const MIXED_HINT = "Mixed currencies — total needs conversion (coming soon)";

/**
 * The three money stats (market value, cost basis, unrealized P&L), shared by
 * the vault hero and the profile so the display + hide-value logic lives in one
 * place. `stats` is injectable for tests; defaults to the live hook.
 */
export function ValueStats({ stats }: { stats?: CollectionStats }) {
	const live = useCollectionStats();
	const s = stats ?? live;
	const hidden = useHideValue();

	const market =
		s.marketValue != null ? formatPrice(s.marketValue, s.valueCurrency) : DASH;

	// Cost basis: prefer the FX-summed value; fall back to PR3a's single-currency
	// estValue; mixed single-currency-unknown renders "—" with a hint.
	let cost = DASH;
	let costMixed = false;
	if (s.costBasisConverted != null) {
		cost = formatPrice(s.costBasisConverted, s.valueCurrency);
	} else if (s.estValue != null && s.estValueCurrency != null) {
		cost = formatPrice(s.estValue, s.estValueCurrency);
	} else if (s.estValue != null && s.estValueCurrency == null) {
		costMixed = true;
	}

	const pnlTone: "up" | "down" | undefined =
		s.unrealizedPnL == null ? undefined : s.unrealizedPnL >= 0 ? "up" : "down";

	return (
		<>
			<Stat value={hidden ? MASK : market} label="market value" />
			{costMixed && !hidden ? (
				<span title={MIXED_HINT} role="note">
					<Stat value={DASH} label="cost basis" />
				</span>
			) : (
				<Stat value={hidden ? MASK : cost} label="cost basis" />
			)}
			{s.unrealizedPnL != null && (
				<Stat
					value={
						hidden ? MASK : formatSignedPrice(s.unrealizedPnL, s.valueCurrency)
					}
					label="unrealized p&l"
					tone={hidden ? undefined : pnlTone}
				/>
			)}
		</>
	);
}
