import { useNavigate } from "@tanstack/react-router";
import { Boxes, History, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { cardRouteProps } from "../../lib/card-route";
import { isSupportedLanguage } from "../../lib/languages";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavTree } from "../../lib/nav-tree";
import { useCommandPalette } from "../../store/command-palette";
import {
	type I18nOverlay,
	queryCorpus,
	setsById,
} from "../../store/corpus/corpus-engine";
import {
	loadCorpus,
	useCorpusRuntime,
	useSlugIndex,
} from "../../store/corpus/corpus-runtime";
import {
	useActiveI18n,
	useEnsureI18n,
} from "../../store/corpus/i18n-active-hooks";
import { useStore } from "../../store/index";
import { useRecentsStore } from "../../store/recents";
import { allLoadedSets } from "../../store/sets-slice";
import { cardThumbSrc, type HoloCardData } from "../holo-card";
import { NAV_DESTINATIONS } from "./command-palette-data";

const KBD =
	"rounded border border-[var(--border)] bg-[var(--glass)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-muted)]";

/**
 * The ⌘K command palette. Mounted once in the app shell. Owns the global
 * keyboard shortcut and reads its open state from {@link useCommandPalette}
 * (the header trigger toggles the same store). With `shouldFilter={false}` the
 * groups are computed here — live corpus cards, recents, nav, and set jumps —
 * rather than cmdk's built-in substring filter, so each source ranks its own way.
 */
export function CommandPalette({ tree }: { tree: NavTree }) {
	const open = useCommandPalette((s) => s.open);
	const setOpen = useCommandPalette((s) => s.setOpen);
	const toggle = useCommandPalette((s) => s.toggle);

	const [query, setQuery] = useState("");
	// cmdk's selected item value. Controlled so we can re-pin it to the first row
	// whenever the result set changes — otherwise the deferred list lags the input
	// and cmdk drops its selection, leaving Enter with nothing to fire.
	const [value, setValue] = useState("");
	// Defer the corpus query so fast typing keeps the input responsive — the
	// 20k-card scan runs against the lagging value, the input against the live one.
	const deferred = useDeferredValue(query);
	const trimmed = deferred.trim();

	const index = useCorpusRuntime((s) => s.index);
	// ⌘K searches every loaded region's sets (not the bare west-only `sets`), so an
	// Asian set resolves + is navigable. allLoadedSets builds a fresh array, so
	// useShallow keeps the subscription/ref stable across unrelated store writes.
	const sets = useStore(useShallow(allLoadedSets));
	const slugIndex = useSlugIndex();
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const addRecentSearch = useRecentsStore((s) => s.addRecentSearch);
	const navigate = useNavigate();

	// Global ⌘K / Ctrl+K — mirrors the sidebar's Cmd+B handler.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				toggle();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [toggle]);

	// Pull the corpus into memory the first time the palette opens.
	useEffect(() => {
		if (open) void loadCorpus();
	}, [open]);

	useEnsureI18n();
	const i18n = useActiveI18n();
	const cardResults = useMemo(() => {
		if (!trimmed || !index || !sets.length) return [];
		return queryTopCards(trimmed, index, sets, i18n);
	}, [trimmed, index, sets, i18n]);

	const navMatches = useMemo(() => {
		if (!trimmed) return NAV_DESTINATIONS;
		const q = trimmed.toLowerCase();
		return NAV_DESTINATIONS.filter((d) =>
			`${d.label} ${d.keywords ?? ""}`.toLowerCase().includes(q),
		);
	}, [trimmed]);

	const setMatches = useMemo(() => {
		if (!trimmed) return [];
		const q = trimmed.toLowerCase();
		const out: {
			seriesName: string;
			seriesSlug: string;
			setName: string;
			setSlug: string;
		}[] = [];
		for (const series of tree) {
			for (const set of series.sets) {
				if (
					set.name.toLowerCase().includes(q) ||
					series.name.toLowerCase().includes(q)
				) {
					out.push({
						seriesName: series.name,
						seriesSlug: series.slug,
						setName: set.name,
						setSlug: set.slug,
					});
					if (out.length >= 8) return out;
				}
			}
		}
		return out;
	}, [trimmed, tree]);

	// The value of the first row in current render order — the Enter default.
	const firstValue = trimmed
		? "run-search"
		: recentSearches[0]
			? `recent-${recentSearches[0]}`
			: recentlyViewed[0]
				? `viewed-${recentlyViewed[0].id}`
				: navMatches[0]
					? `nav-${navMatches[0].to}`
					: "";
	// Re-pin selection to the first row when the result set changes (both derive
	// from the deferred query, so the row exists by the time this runs).
	useEffect(() => setValue(firstValue), [firstValue]);

	function close() {
		setOpen(false);
		setQuery("");
	}

	function runSearch(q: string) {
		const t = q.trim();
		if (!t) return;
		addRecentSearch(t);
		close();
		navigate({ to: "/search", search: { ...LIST_SEARCH_DEFAULTS, q: t } });
	}

	function goToCard(card: HoloCardData) {
		if (!slugIndex) return;
		const lang = i18n?.lang;
		const lp = cardRouteProps(
			slugIndex,
			card,
			lang && isSupportedLanguage(lang) ? lang : null,
		);
		if (!lp) return;
		close();
		navigate(lp);
	}

	return (
		<CommandDialog
			open={open}
			onOpenChange={(o) => (o ? setOpen(true) : close())}
			shouldFilter={false}
			loop
			value={value}
			onValueChange={setValue}
		>
			<CommandInput
				placeholder="Search cards, recent searches, pages…"
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				<CommandEmpty>
					No matches — press Enter to search all cards.
				</CommandEmpty>

				{trimmed && (
					<CommandGroup heading="Search">
						<CommandItem value="run-search" onSelect={() => runSearch(trimmed)}>
							<Search />
							<span className="truncate">
								Search all cards for{" "}
								<span className="font-medium text-[var(--ink)]">
									“{trimmed}”
								</span>
							</span>
							<CommandShortcut>↵</CommandShortcut>
						</CommandItem>
					</CommandGroup>
				)}

				{cardResults.length > 0 && (
					<CommandGroup heading="Cards">
						{cardResults.map((card) => (
							<CommandItem
								key={card.id}
								value={`card-${card.id}`}
								onSelect={() => goToCard(card)}
							>
								<img
									src={cardThumbSrc(card)}
									alt=""
									loading="lazy"
									className="size-7 shrink-0 rounded object-contain"
								/>
								<span className="truncate">{card.name}</span>
								<span className="ml-auto truncate pl-2 text-xs text-[var(--faint)]">
									{card.setName}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{!trimmed && recentSearches.length > 0 && (
					<CommandGroup heading="Recent searches">
						{recentSearches.map((s) => (
							<CommandItem
								key={s}
								value={`recent-${s}`}
								onSelect={() => runSearch(s)}
							>
								<History />
								<span className="truncate">{s}</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{!trimmed && recentlyViewed.length > 0 && (
					<CommandGroup heading="Recently viewed">
						{recentlyViewed.slice(0, 6).map((card) => (
							<CommandItem
								key={card.id}
								value={`viewed-${card.id}`}
								onSelect={() => goToCard(card)}
							>
								<img
									src={cardThumbSrc(card)}
									alt=""
									loading="lazy"
									className="size-7 shrink-0 rounded object-contain"
								/>
								<span className="truncate">{card.name}</span>
								<span className="ml-auto truncate pl-2 text-xs text-[var(--faint)]">
									{card.setName}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{navMatches.length > 0 && (
					<CommandGroup heading="Go to">
						{navMatches.map((d) => (
							<CommandItem
								key={String(d.to)}
								value={`nav-${d.to}`}
								onSelect={() => {
									close();
									navigate({ to: d.to });
								}}
							>
								<d.icon />
								<span>{d.label}</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{setMatches.length > 0 && (
					<CommandGroup heading="Sets">
						{setMatches.map((m) => (
							<CommandItem
								key={`${m.seriesSlug}/${m.setSlug}`}
								value={`set-${m.seriesSlug}-${m.setSlug}`}
								onSelect={() => {
									close();
									navigate({
										to: "/$series/$set",
										params: { series: m.seriesSlug, set: m.setSlug },
										search: LIST_SEARCH_DEFAULTS,
									});
								}}
							>
								<Boxes />
								<span className="truncate">{m.setName}</span>
								<span className="ml-auto truncate pl-2 text-xs text-[var(--faint)]">
									{m.seriesName}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>

			<div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--faint)]">
				<span className="flex items-center gap-1">
					<kbd className={KBD}>↑↓</kbd> navigate
				</span>
				<span className="flex items-center gap-1">
					<kbd className={KBD}>↵</kbd> select
				</span>
				<span className="flex items-center gap-1">
					<kbd className={KBD}>esc</kbd> close
				</span>
			</div>
		</CommandDialog>
	);
}

/** Top corpus matches for the palette — fuzzy, relevance-ranked, capped at 6. */
function queryTopCards(
	q: string,
	index: NonNullable<ReturnType<typeof useCorpusRuntime.getState>["index"]>,
	sets: NonNullable<ReturnType<typeof useStore.getState>["sets"]>,
	i18n?: I18nOverlay | null,
): HoloCardData[] {
	return queryCorpus(
		index,
		{ query: q, mode: "fuzzy", relevance: true },
		setsById(sets),
		i18n,
	).slice(0, 6);
}
