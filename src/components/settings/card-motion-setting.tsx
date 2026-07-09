import { GlassPanel } from "@/components/ui/glass";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import { useUiPrefs } from "@/store/ui-prefs";

/**
 * "Card motion" preference: toggles the pointer-tracking 3D tilt + foil that
 * cards run on hover. Persisted via {@link useUiPrefs} (default on). Reads the
 * value and setter with per-field selectors (S3) so the panel only re-renders
 * when the pref itself changes. prefers-reduced-motion always disables the tilt
 * regardless of this toggle.
 */
export function CardMotionSetting() {
	const cardMotion = useUiPrefs((s) => s.cardMotion);
	const setCardMotion = useUiPrefs((s) => s.setCardMotion);

	return (
		<GlassPanel className="flex items-start justify-between gap-4 p-5">
			<label htmlFor="card-motion" className="flex flex-col gap-1">
				<span className="font-display text-lg">
					{m.settings_card_motion_title()}
				</span>
				<span className="font-mono text-[12px] text-(--ink-muted)">
					{m.settings_card_motion_description()}
				</span>
			</label>
			<Switch
				id="card-motion"
				checked={cardMotion}
				onCheckedChange={setCardMotion}
				aria-label={m.settings_card_motion_title()}
			/>
		</GlassPanel>
	);
}
