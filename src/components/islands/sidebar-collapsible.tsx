import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Layers, Vault } from "lucide-react";
import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavSeries, NavTree } from "../../lib/nav-tree";

interface SidebarCollapsibleProps {
	tree: NavTree;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
	onNavigate?: () => void;
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

function VaultGroup({ onNavigate }: { onNavigate?: () => void }) {
	const { pathname } = useLocation();
	const isVaultPath = pathname.startsWith("/vault");
	const [open, setOpen] = useState(isVaultPath);

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary",
					isVaultPath ? "text-primary" : "text-foreground",
				)}
			>
				<ChevronRight
					className={cn(
						"size-4 shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
				<Vault className="size-4 shrink-0" />
				<span className="flex-1">Vault</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="ml-4 border-l border-border pl-3">
				{VAULT_CHILDREN.map(({ label, to }) => (
					<Link
						key={to}
						to={to}
						onClick={() => onNavigate?.()}
						activeOptions={{ exact: true }}
						activeProps={{ "aria-current": "page" as const }}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary hover:text-foreground",
							pathname === to
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground",
						)}
					>
						{label}
					</Link>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

function SeriesRow({
	series,
	activeSeriesSlug,
	activeSetSlug,
	onNavigate,
}: {
	series: NavSeries;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
	onNavigate?: () => void;
}) {
	const [open, setOpen] = useState(series.slug === activeSeriesSlug);
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-secondary",
					series.slug === activeSeriesSlug ? "text-primary" : "text-foreground",
				)}
			>
				<ChevronRight
					className={cn(
						"size-4 shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
				<span className="flex-1 truncate">{series.name}</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{series.year}
				</span>
				<span className="text-xs text-muted-foreground">
					{series.sets.length}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="ml-4 border-l border-border pl-3">
				{series.sets.map((set) => (
					<Link
						key={set.id}
						to="/$series/$set"
						params={{ series: series.slug, set: set.slug }}
						search={LIST_SEARCH_DEFAULTS}
						onClick={() => onNavigate?.()}
						aria-current={set.slug === activeSetSlug ? "page" : undefined}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary hover:text-foreground",
							set.slug === activeSetSlug
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground",
						)}
					>
						<img
							src={set.symbol}
							alt=""
							className="max-h-5 max-w-5 object-contain"
						/>
						<span className="flex-1 truncate">{set.name}</span>
						<span className="text-xs opacity-70">{set.total}</span>
					</Link>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

export function SidebarCollapsible({
	tree,
	activeSeriesSlug,
	activeSetSlug,
	onNavigate,
}: SidebarCollapsibleProps) {
	return (
		<nav className="flex flex-col gap-0.5 p-3">
			<Link
				to="/"
				onClick={() => onNavigate?.()}
				className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
			>
				Home
			</Link>
			<VaultGroup onNavigate={onNavigate} />
			<div className="mt-2 flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				<Layers className="size-4" />
				Series &amp; Sets
			</div>
			{tree.map((series) => (
				<SeriesRow
					key={series.slug}
					series={series}
					activeSeriesSlug={activeSeriesSlug}
					activeSetSlug={activeSetSlug}
					onNavigate={onNavigate}
				/>
			))}
		</nav>
	);
}
