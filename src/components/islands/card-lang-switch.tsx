import { useNavigate } from "@tanstack/react-router";
import type { ListSearch } from "../../lib/card-query";
import {
	isI18nFallback,
	useActiveI18n,
} from "../../store/corpus/i18n-active-hooks";
import { CardLanguageControl } from "./card-language-control";

/**
 * Language picker + fallback notice wired to the active route's `lang` search
 * param. Works for both the history-state overlay (CardOverlay) and the cold
 * $card route: useNavigate patches `lang` on the current route in both cases,
 * and useEnsureI18n (called inside CardCockpit) re-localizes on the new param.
 *
 * Requires a client context (useNavigate / useActiveI18n). Wrap in ClientOnly
 * when rendering inside an SSR route.
 */
export function CardLangSwitch({ cardId }: { cardId: string }) {
	const navigate = useNavigate();
	const i18n = useActiveI18n();
	const lang = i18n?.lang ?? "en";
	const isFallback = isI18nFallback(i18n, cardId);
	return (
		<div className="flex items-center gap-2">
			<CardLanguageControl
				value={{ lang: lang === "en" ? null : lang } as ListSearch}
				onChange={(patch) =>
					void navigate({
						to: ".",
						search: (prev) => ({ ...prev, lang: patch.lang ?? null }),
						replace: true,
					})
				}
			/>
			{isFallback ? (
				<span className="font-mono text-[11px] text-(--ink-muted)">
					Shown in English.
				</span>
			) : null}
		</div>
	);
}
