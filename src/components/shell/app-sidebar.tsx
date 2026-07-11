import { Link, type LinkComponentProps } from "@tanstack/react-router";
import {
	BookOpen,
	Boxes,
	ChevronRight,
	Layers,
	LayoutDashboard,
	type LucideIcon,
	ScanLine,
	Sparkles,
	Users,
	Zap,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { useIsActive } from "@/hooks/use-is-active";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import {
	type NavSeries,
	type NavSet,
	type NavTree,
	seriesMonogram,
} from "../../lib/nav-tree";
import { POKEDEX_FILTER_DEFAULTS } from "../../lib/pokedex";
import { GlobalLanguageControl } from "../islands/global-language-control";
import { SidebarUserMenu } from "./sidebar-user-menu";

interface AppSidebarProps {
	tree: NavTree;
}

export function AppSidebar({ tree }: AppSidebarProps) {
	return (
		// `floating` variant: the sidebar is its own symmetric card, so collapsed
		// glyphs centre cleanly against it. The icon-mode overrides below are the
		// whole centering story: `px-0` on the header/groups + `justify-center` on
		// the menu items centre the menu button within the card, and `p-1` on the
		// nav buttons fits the 24px glyph (which then fills + centres in its button).
		<Sidebar variant="floating" collapsible="icon">
			<SidebarHeader>
				<SidebarHeaderContent />
			</SidebarHeader>

			<SidebarContent>
				<VaultGroup />
				<BrowseGroup />
				<SeriesGroup tree={tree} />
			</SidebarContent>

			<SidebarFooter>
				<GlobalLanguageControl />
				<SidebarUserMenu />
			</SidebarFooter>
		</Sidebar>
	);
}

function SidebarHeaderContent(): React.JSX.Element {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton size="lg" asChild tooltip={m.sidebar_home_tooltip()}>
					<Link to="/">
						<div
							className="grid size-9 shrink-0 place-items-center rounded-[11px] shadow-[0_6px_18px_-6px_var(--primary)] group-data-[collapsible=icon]:size-8"
							data-slot="icon"
							style={{
								background:
									"linear-gradient(135deg, var(--primary), oklch(0.6 0.18 320))",
							}}
						>
							<img
								src="/logo-64.png"
								alt=""
								className="size-6 object-contain drop-shadow-sm"
							/>
						</div>
						<div className="grid flex-1 text-left leading-tight">
							<span className="truncate font-display text-sm font-semibold">
								Cardstack
							</span>
							<span className="font-mono text-[10px] text-(--faint)">
								{m.sidebar_tagline()}
							</span>
						</div>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

interface VaultChild {
	/** Thunk, not a plain string — see {@link NavDestination.label} in command-palette-data.ts. */
	label: () => string;
	to: LinkComponentProps["to"];
	icon: LucideIcon;
}

const VAULT_CHILDREN: readonly VaultChild[] = [
	{
		label: () => m.sidebar_vault_overview(),
		to: "/vault",
		icon: LayoutDashboard,
	},
	{
		label: () => m.command_palette_nav_all_cards(),
		to: "/vault/cards",
		icon: Layers,
	},
	{
		label: () => m.command_palette_nav_binders(),
		to: "/vault/binders",
		icon: BookOpen,
	},
	{ label: () => m.sidebar_vault_sets(), to: "/vault/sets", icon: Boxes },
	{
		label: () => m.command_palette_nav_scan_cards(),
		to: "/scan",
		icon: ScanLine,
	},
];

/** Flat Vault items under the "Vault" group label (matches the mock — no nested
 *  collapsible, no redundant "Vault" parent). */
function VaultGroup() {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>{m.bottom_nav_vault()}</SidebarGroupLabel>
			<SidebarMenu>
				{VAULT_CHILDREN.map((item) => {
					return <VaultItem key={item.to} item={item} />;
				})}
			</SidebarMenu>
		</SidebarGroup>
	);
}

function VaultItem({ item }: { item: VaultChild }) {
	const isActive = useIsActive(item.to, { exact: true });

	return (
		<SidebarMenuLink
			to={item.to}
			isActive={isActive}
			activeOptions={{ exact: true }}
		>
			{item.icon && (
				<item.icon
					className={cn(
						"transition-colors",
						isActive ? "text-primary" : "text-(--ink-muted)",
					)}
				/>
			)}
			<span>{item.label()}</span>
		</SidebarMenuLink>
	);
}

/** Icon + label body of a Browse row — mirrors {@link VaultItem}'s inner markup
 *  (direct lucide child so the menu-button's `[&>svg]:size-4` rule sizes it). */
function BrowseRow({
	icon: Icon,
	label,
	active,
}: {
	icon: LucideIcon;
	label: string;
	active: boolean;
}) {
	return (
		<>
			<Icon
				className={cn(
					"transition-colors",
					active ? "text-primary" : "text-(--ink-muted)",
				)}
			/>
			<span>{label}</span>
		</>
	);
}

/**
 * Browse-by-supertype entry points (Pokémon / Trainer / Energy), placed above
 * the Series & Sets group — a broader lens than drilling into one set. Each row
 * carries its route's required search param (typed `<Link>` errors without it).
 * Prefix `useIsActive` (no `exact`) keeps the tab lit while drilling into a card,
 * matching {@link SeriesItem}'s browse-entry behavior.
 */
function BrowseGroup() {
	const pokemonActive = useIsActive("/pokemon");
	const trainerActive = useIsActive("/trainer");
	const energyActive = useIsActive("/energy");
	return (
		<SidebarGroup>
			<SidebarGroupLabel>{m.command_palette_nav_browse()}</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuLink
					to="/pokemon"
					search={POKEDEX_FILTER_DEFAULTS}
					isActive={pokemonActive}
				>
					<BrowseRow
						icon={Sparkles}
						label={m.home_supertype_pokemon()}
						active={pokemonActive}
					/>
				</SidebarMenuLink>
				<SidebarMenuLink
					to="/trainer"
					search={LIST_SEARCH_DEFAULTS}
					isActive={trainerActive}
				>
					<BrowseRow
						icon={Users}
						label={m.home_supertype_trainers()}
						active={trainerActive}
					/>
				</SidebarMenuLink>
				<SidebarMenuLink
					to="/energy"
					search={LIST_SEARCH_DEFAULTS}
					isActive={energyActive}
				>
					<BrowseRow
						icon={Zap}
						label={m.home_supertype_energy()}
						active={energyActive}
					/>
				</SidebarMenuLink>
			</SidebarMenu>
		</SidebarGroup>
	);
}

function SeriesGroup({ tree }: AppSidebarProps) {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>{m.sidebar_series_and_sets()}</SidebarGroupLabel>
			<SidebarMenu>
				{tree.map((series) => (
					<SeriesItem key={series.slug} series={series} />
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}

function SeriesItem({ series }: { series: NavSeries }) {
	const mono = seriesMonogram(series.name);
	const { state } = useSidebar();
	const isActive = useIsActive(`/${series.slug}`);

	if (state === "collapsed") {
		return (
			<SidebarMenuLink
				to="/$series"
				params={{ series: series.slug }}
				isActive={isActive}
			>
				<NavGlyph active={isActive} mono={mono} />
				<span>{series.name}</span>
			</SidebarMenuLink>
		);
	}

	return (
		<Collapsible defaultOpen={isActive} className="group/collapsible">
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isActive} tooltip={series.name}>
						<NavGlyph active={isActive} mono={mono} />
						<span className="flex-1 truncate">{series.name}</span>
						<span className="font-mono text-(--faint) text-xs tabular-nums">
							{series.year}
						</span>
						<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
					</SidebarMenuButton>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarMenuSub>
						{series.sets.map((set) => (
							<SetItem key={set.id} set={set} seriesSlug={series.slug} />
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

interface SetItemProps {
	set: NavSet;
	seriesSlug: string;
}

/**
 * Set-list icon: a series-style mono glass badge (the set monogram) fills the
 * 24px slot immediately, then the pokemontcg.io symbol fades in over it on load.
 * No pop-in (the slot is reserved by the badge), and a missing/dead symbol simply
 * leaves the monogram — visually consistent with the series NavGlyph badges.
 */
function SetGlyph({ name, symbol }: { name: string; symbol?: string }) {
	const [loaded, setLoaded] = useState(false);
	const ref = useRef<HTMLImageElement>(null);
	// A cached/already-decoded symbol can finish loading before React attaches the
	// onLoad handler, so onLoad never fires and the image would stay invisible.
	// Reconcile against `complete` once after mount; onLoad covers the async case.
	useEffect(() => {
		if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
	}, []);
	return (
		<span
			data-slot="icon"
			className="relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-white/10 bg-white/5 font-mono text-[11px] font-semibold leading-none text-(--ink-muted) shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] group-data-[collapsible=icon]:-m-1"
		>
			{loaded ? null : seriesMonogram(name)}
			{symbol ? (
				<img
					ref={ref}
					src={symbol}
					alt=""
					onLoad={() => setLoaded(true)}
					className={cn(
						"absolute inset-0 m-auto max-h-4 max-w-4 object-contain transition-opacity duration-200",
						loaded ? "opacity-100" : "opacity-0",
					)}
				/>
			) : null}
		</span>
	);
}

function SetItem({ set, seriesSlug }: SetItemProps) {
	const isActive = useIsActive(`/${seriesSlug}/${set.slug}`, { exact: true });
	const { setOpenMobile } = useSidebar();
	// Coerce a blank/nullish symbol url to `undefined` and skip the <img> — an
	// empty `src=""` re-fetches the whole page (HTML spec → flash).
	const symbol = set.symbol ? set.symbol : undefined;

	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton
				asChild
				isActive={isActive}
				aria-current={isActive ? "page" : undefined}
			>
				<Link
					to="/$series/$set"
					params={{ series: seriesSlug, set: set.slug }}
					search={LIST_SEARCH_DEFAULTS}
					onClick={() => setOpenMobile(false)}
				>
					<SetGlyph name={set.name} symbol={symbol} />
					<span className="flex-1 truncate">{set.name}</span>
					<span className="font-mono text-(--faint) text-xs tabular-nums opacity-70">
						{set.total}
					</span>
				</Link>
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
	);
}

interface SidebarMenuButtonLinkProps
	extends Pick<
			React.ComponentProps<typeof SidebarMenuButton>,
			"isActive" | "tooltip" | "className" | "size"
		>,
		LinkComponentProps {}

function SidebarMenuLink({
	isActive,
	tooltip,
	size,
	className,
	...rest
}: SidebarMenuButtonLinkProps) {
	const { setOpenMobile } = useSidebar();

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild
				isActive={isActive}
				size={size}
				tooltip={tooltip}
				className={className}
				aria-current={isActive ? "page" : undefined}
			>
				<Link
					aria-current={isActive ? "page" : undefined}
					onClick={() => setOpenMobile(false)}
					{...rest}
				/>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/**
 * Shared 24px (`size-6`) leading slot for nav rows — the one child that survives
 * the collapse-to-icon clip. `icon` mode renders a lucide glyph (Vault rows);
 * `mono` mode renders a 2-char series monogram on a calm glass chip. Active →
 * violet, matching the rest of the nav. The lucide glyph is nested inside a span
 * so the menu-button's `[&>svg]:size-4` rule (direct-child only) doesn't shrink it.
 */
function NavGlyph({
	active,
	icon: Icon,
	mono,
}: {
	active: boolean;
	icon?: LucideIcon;
	mono?: string;
}) {
	if (Icon) {
		return (
			<span className="grid size-6 shrink-0 place-items-center">
				<Icon
					className={cn(
						"size-4.5 transition-colors",
						active ? "text-primary" : "text-(--ink-muted)",
					)}
				/>
			</span>
		);
	}

	return (
		<span
			data-slot="icon"
			className={cn(
				// `-m-1` (collapsed only) shrinks the 24px badge's layout footprint
				// to 16px so it centres in the icon rail like a stock 16px icon,
				// while still rendering at 24px.
				"grid size-6 shrink-0 place-items-center rounded-[7px] border font-mono text-[11px] font-semibold leading-none tabular-nums transition-colors group-data-[collapsible=icon]:-m-1",
				active
					? "border-transparent bg-primary text-white shadow-[0_4px_12px_-6px_var(--primary)]"
					: "border-white/10 bg-white/5 text-(--ink-muted) shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
			)}
		>
			{mono}
		</span>
	);
}
