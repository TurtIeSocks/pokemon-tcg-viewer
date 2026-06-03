import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Vault } from "lucide-react";
import { useState } from "react";
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
import type { NavSeries, NavTree } from "../../lib/nav-tree";
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
}

const VAULT_CHILDREN: VaultChild[] = [
	{ label: "Cards", to: "/vault" },
	{ label: "Sets", to: "/vault/sets" },
	{ label: "Binders", to: "/vault/binders" },
];

/** Small square dot — inactive = white/20, active = primary */
function NavDot({ active }: { active: boolean }) {
	return (
		<span
			className={cn(
				"size-1.5 shrink-0 rounded-[2px] transition-colors",
				active ? "bg-[var(--primary)]" : "bg-white/20",
			)}
		/>
	);
}

function VaultGroup() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { setOpenMobile } = useSidebar();
	const isVaultPath = pathname.startsWith("/vault");
	const [open, setOpen] = useState(isVaultPath);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isVaultPath} tooltip="Vault">
						<NavDot active={isVaultPath} />
						<ChevronRight
							className={cn(
								"size-4 shrink-0 transition-transform",
								open && "rotate-90",
							)}
						/>
						<Vault className="size-4 shrink-0" />
						<span className="flex-1">Vault</span>
					</SidebarMenuButton>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarMenuSub>
						{VAULT_CHILDREN.map(({ label, to }) => {
							const isActive = pathname === to;
							return (
								<SidebarMenuSubItem key={to}>
									<SidebarMenuSubButton
										asChild
										isActive={isActive}
										aria-current={isActive ? "page" : undefined}
									>
										<Link
											to={to}
											activeOptions={{ exact: true }}
											activeProps={{}}
											onClick={() => setOpenMobile(false)}
										>
											<NavDot active={isActive} />
											{label}
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

function SeriesItem({
	series,
	activeSeriesSlug,
	activeSetSlug,
}: {
	series: NavSeries;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
}) {
	const { setOpenMobile } = useSidebar();
	const [open, setOpen] = useState(series.slug === activeSeriesSlug);
	const isActiveSeries = series.slug === activeSeriesSlug;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isActiveSeries} tooltip={series.name}>
						<NavDot active={isActiveSeries} />
						<ChevronRight
							className={cn(
								"size-4 shrink-0 transition-transform",
								open && "rotate-90",
							)}
						/>
						<span className="flex-1 truncate">{series.name}</span>
						<span className="font-mono text-[var(--faint)] text-xs tabular-nums">
							{series.year}
						</span>
						<span className="font-mono text-[var(--faint)] text-xs tabular-nums">
							{series.sets.length}
						</span>
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
						<SidebarMenuButton size="lg" asChild tooltip="TCG Viewer — home">
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
										TCG Viewer
									</span>
									<span className="font-mono text-[10px] text-[var(--faint)]">
										vault
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
					{/* Avatar */}
					<div
						className="size-7 shrink-0 rounded-full"
						style={{
							background:
								"linear-gradient(135deg, oklch(0.5 0.12 290), oklch(0.4 0.1 320))",
						}}
					/>
					{/* Label — hidden in icon-collapsed state */}
					<span className="flex-1 truncate text-xs text-[var(--ink-muted)] group-data-[collapsible=icon]:hidden">
						Collector
					</span>
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
