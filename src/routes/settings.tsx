import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { CardGlyph } from "@/components/ui/card-glyph";
import { LanguageRadioMenu } from "@/components/islands/card-language-control";
import { CardDatabaseSetting } from "@/components/settings/card-database-setting";
import { CardMotionSetting } from "@/components/settings/card-motion-setting";
import { ImageCacheSetting } from "@/components/settings/image-cache-setting";
import { UiLanguageSetting } from "@/components/settings/ui-language-setting";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlassPanel } from "@/components/ui/glass";
import { LANGUAGE_LABELS } from "@/lib/languages";
import { m } from "@/paraglide/messages";
import { useDisplayLanguage } from "@/store/corpus/i18n-active-hooks";
import { updateProfile } from "@/store/userland/userland-store";
import { getNavTreeFn } from "../server/nav-tree";

export const Route = createFileRoute("/settings")({
	loader: () => getNavTreeFn(),
	head: () => ({ meta: [{ title: "Settings · Pokémon TCG" }] }),
	component: SettingsPage,
});

/**
 * Persistent catalog display-language control. Same region-grouped radio body as
 * the always-visible sidebar/header quick pickers, but this is the durable
 * "settings" home for the preference (writes `profile.displayLanguage`). Reads
 * `useDisplayLanguage()`, so it must live inside the page's `<ClientOnly>`.
 */
function CatalogLanguageSetting() {
	const lang = useDisplayLanguage();
	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">
					{m.settings_catalog_language_title()}
				</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{m.settings_catalog_language_description()}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							aria-label={m.settings_catalog_language_title()}
						>
							<CardGlyph className="size-4 opacity-70" />
							<span>{LANGUAGE_LABELS[lang]}</span>
							<ChevronDown className="size-4 opacity-70" />
						</Button>
					</DropdownMenuTrigger>
					<LanguageRadioMenu
						value={lang}
						align="start"
						onValueChange={(next) => {
							void updateProfile({ displayLanguage: next });
						}}
					/>
				</DropdownMenu>
			</div>
		</GlassPanel>
	);
}

function SettingsPage() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-8">
			<header className="flex flex-col gap-1">
				<h1 className="font-display text-3xl">{m.settings_page_title()}</h1>
			</header>
			<ClientOnly fallback={null}>
				<CatalogLanguageSetting />
				<UiLanguageSetting />
				<CardMotionSetting />
				<h2 className="mt-2 font-display text-lg text-(--ink-muted)">
					{m.settings_caching_offline_heading()}
				</h2>
				<CardDatabaseSetting />
				<ImageCacheSetting />
			</ClientOnly>
		</div>
	);
}
