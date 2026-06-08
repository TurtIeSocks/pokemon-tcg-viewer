import { Link, useRouterState } from "@tanstack/react-router";
import {
	BookOpen,
	Boxes,
	ChevronRight,
	Layers,
	LayoutDashboard,
	type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { CollectorAvatar } from "@/components/profile/collector-avatar";
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
import { cn } from "@/lib/utils";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import {
	type NavSeries,
	type NavTree,
	seriesMonogram,
} from "../../lib/nav-tree";
import { useUserland } from "../../store/userland/userland-store";
import { AboutDialog } from "./about-dialog";
import { RepoLink } from "./repo-link";

interface AppSidebarProps {
	tree: NavTree;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
}

interface VaultChild {
	label: string;
	to: string;
	icon: LucideIcon;
}

const VAULT_CHILDREN: VaultChild[] = [
	{ label: "Overview", to: "/vault", icon: LayoutDashboard },
	{ label: "All cards", to: "/vault/cards", icon: Layers },
	{ label: "Sets", to: "/vault/sets", icon: Boxes },
	{ label: "Binders", to: "/vault/binders", icon: BookOpen },
];

/**
 * Shared ~22px leading slot for nav rows — the one child that survives the
 * collapse-to-icon clip. `icon` mode renders a lucide glyph (Vault rows); `mono`
 * mode renders a 2-char series monogram on a calm glass chip. Active → violet,
 * matching the rest of the nav. The lucide glyph is nested inside a span so the
 * menu-button's `[&>svg]:size-4` rule (direct-child only) doesn't shrink it.
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
			<span className="grid size-[22px] shrink-0 place-items-center">
				<Icon
					className={cn(
						"size-[18px] transition-colors",
						active ? "text-[var(--primary)]" : "text-[var(--ink-muted)]",
					)}
				/>
			</span>
		);
	}
	return (
		<span
			className={cn(
				"grid size-[22px] shrink-0 place-items-center rounded-[7px] border font-mono text-[11px] font-semibold leading-none tabular-nums transition-colors",
				active
					? "border-transparent bg-[var(--primary)] text-white shadow-[0_4px_12px_-6px_var(--primary)]"
					: "border-white/10 bg-white/[0.05] text-[var(--ink-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
			)}
		>
			{mono}
		</span>
	);
}

/** Flat Vault items under the "Vault" group label (matches the mock — no nested
 *  collapsible, no redundant "Vault" parent). */
function VaultGroup() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { setOpenMobile } = useSidebar();

	return (
		<>
			{VAULT_CHILDREN.map(({ label, to, icon }) => {
				const isActive = pathname === to;
				return (
					<SidebarMenuItem key={to}>
						<SidebarMenuButton
							asChild
							isActive={isActive}
							tooltip={label}
							className="group-data-[collapsible=icon]:p-1!"
						>
							<Link
								to={to}
								activeOptions={{ exact: true }}
								onClick={() => setOpenMobile(false)}
								aria-current={isActive ? "page" : undefined}
							>
								<NavGlyph active={isActive} icon={icon} />
								<span>{label}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				);
			})}
		</>
	);
}

function SeriesItem({
	series,
	activeSeriesSlug,
	activeSetSlug,
}: {
	series: NavSeries;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
}) {
	const { state, setOpenMobile } = useSidebar();
	const [open, setOpen] = useState(series.slug === activeSeriesSlug);
	const isActiveSeries = series.slug === activeSeriesSlug;
	const mono = seriesMonogram(series.name);

	// Collapsed icon rail: sub-sets can't render, so the badge links straight to
	// the series overview page instead of toggling a hidden sub-menu.
	if (state === "collapsed") {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton
					asChild
					isActive={isActiveSeries}
					tooltip={series.name}
					className="group-data-[collapsible=icon]:p-1!"
				>
					<Link
						to="/$series"
						params={{ series: series.slug }}
						onClick={() => setOpenMobile(false)}
						aria-current={isActiveSeries ? "page" : undefined}
					>
						<NavGlyph active={isActiveSeries} mono={mono} />
						<span className="flex-1 truncate">{series.name}</span>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isActiveSeries} tooltip={series.name}>
						<NavGlyph active={isActiveSeries} mono={mono} />
						<span className="flex-1 truncate">{series.name}</span>
						<span className="font-mono text-[var(--faint)] text-xs tabular-nums">
							{series.year}
						</span>
						<span className="font-mono text-[var(--faint)] text-xs tabular-nums">
							{series.sets.length}
						</span>
						<ChevronRight
							className={cn(
								"size-4 shrink-0 text-[var(--faint)] transition-transform",
								open && "rotate-90",
							)}
						/>
					</SidebarMenuButton>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarMenuSub>
						{series.sets.map((set) => {
							const isActive = set.slug === activeSetSlug;
							return (
								<SidebarMenuSubItem key={set.id}>
									<SidebarMenuSubButton
										asChild
										isActive={isActive}
										aria-current={isActive ? "page" : undefined}
									>
										<Link
											to="/$series/$set"
											params={{ series: series.slug, set: set.slug }}
											search={LIST_SEARCH_DEFAULTS}
											onClick={() => setOpenMobile(false)}
										>
											<img
												src={set.symbol}
												alt=""
												className="max-h-4 max-w-4 object-contain"
											/>
											<span className="flex-1 truncate">{set.name}</span>
											<span className="font-mono text-[var(--faint)] text-xs tabular-nums opacity-70">
												{set.total}
											</span>
										</Link>
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							);
						})}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

/** Sidebar footer identity: avatar + name, linking to the profile page. */
function FooterIdentity() {
	const profile = useUserland((s) => s.profile);
	const { setOpenMobile } = useSidebar();
	const displayName = profile?.displayName || "Collector";
	const preset = profile?.avatarPreset ?? "dusk";
	return (
		<Link
			to="/profile"
			onClick={() => setOpenMobile(false)}
			className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 transition-colors hover:text-[var(--ink)]"
		>
			<CollectorAvatar displayName={displayName} preset={preset} size={28} />
			<span className="flex-1 truncate text-xs text-[var(--ink-muted)] group-data-[collapsible=icon]:hidden">
				{displayName}
			</span>
		</Link>
	);
}

export function AppSidebar({
	tree,
	activeSeriesSlug,
	activeSetSlug,
}: AppSidebarProps) {
	return (
		<Sidebar variant="inset" collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild tooltip="CardStack — home">
							<Link to="/">
								<div
									className="grid size-9 shrink-0 place-items-center rounded-[11px] shadow-[0_6px_18px_-6px_var(--primary)]"
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
									<span className="font-mono text-[10px] text-[var(--faint)]">
										Home
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{/* Vault group */}
				<SidebarGroup>
					<SidebarGroupLabel>Vault</SidebarGroupLabel>
					<SidebarMenu>
						<VaultGroup />
					</SidebarMenu>
				</SidebarGroup>

				{/* Series & sets */}
				<SidebarGroup>
					<SidebarGroupLabel>Series &amp; Sets</SidebarGroupLabel>
					<SidebarMenu>
						{tree.map((series) => (
							<SeriesItem
								key={series.slug}
								series={series}
								activeSeriesSlug={activeSeriesSlug}
								activeSetSlug={activeSetSlug}
							/>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<div className="flex items-center gap-2 px-1 py-0.5">
					<FooterIdentity />
					{/* Icon buttons */}
					<div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
						<AboutDialog />
						<RepoLink />
					</div>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
