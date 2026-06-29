import { Link, type LinkComponentProps } from "@tanstack/react-router";
import {
	BookOpen,
	Boxes,
	ChevronRight,
	Layers,
	LayoutDashboard,
	type LucideIcon,
} from "lucide-react";
import type React from "react";
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
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import {
	type NavSeries,
	type NavSet,
	type NavTree,
	seriesMonogram,
} from "../../lib/nav-tree";
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
				<SeriesGroup tree={tree} />
			</SidebarContent>

			<SidebarFooter>
				<SidebarUserMenu />
			</SidebarFooter>
		</Sidebar>
	);
}

function SidebarHeaderContent(): React.JSX.Element {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton size="lg" asChild tooltip="Cardstack, home">
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
								Your cards. Your call.
							</span>
						</div>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

interface VaultChild {
	label: string;
	to: LinkComponentProps["to"];
	icon: LucideIcon;
}

const VAULT_CHILDREN = [
	{ label: "Overview", to: "/vault", icon: LayoutDashboard },
	{ label: "All Cards", to: "/vault/cards", icon: Layers },
	{ label: "Sets", to: "/vault/sets", icon: Boxes },
	{ label: "Binders", to: "/vault/binders", icon: BookOpen },
] as const satisfies VaultChild[];

/** Flat Vault items under the "Vault" group label (matches the mock — no nested
 *  collapsible, no redundant "Vault" parent). */
function VaultGroup() {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>Vault</SidebarGroupLabel>
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
			<span>{item.label}</span>
		</SidebarMenuLink>
	);
}

function SeriesGroup({ tree }: AppSidebarProps) {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>Series &amp; Sets</SidebarGroupLabel>
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
					{symbol ? (
						<img
							src={symbol}
							alt=""
							className="max-h-4 max-w-4 object-contain"
						/>
					) : null}
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
