import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavTree } from "../../server/nav-tree";

interface SidebarNavProps {
	tree: NavTree;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
}

/**
 * SSR-safe series/set navigation. Pure-presentational: takes the serializable
 * nav tree as props and renders TanStack <Link>s. No data fetching, no browser
 * APIs — safe to server-render. The collapsible-animation island is Plan 05;
 * here every series is expanded so all set links are in the crawlable HTML.
 */
export function SidebarNav({
	tree,
	activeSeriesSlug,
	activeSetSlug,
}: SidebarNavProps) {
	return (
		<nav className="flex flex-col gap-0.5 p-3">
			<Link
				to="/"
				className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-secondary"
			>
				Home
			</Link>
			<div className="mt-2 flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				<Layers className="size-4" />
				Series &amp; Sets
			</div>
			{tree.map((series) => (
				<div key={series.slug}>
					<Link
						to="/$series"
						params={{ series: series.slug }}
						className={cn(
							"flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-secondary",
							series.slug === activeSeriesSlug && "text-primary",
						)}
					>
						<span className="flex-1 truncate">{series.name}</span>
						<span className="text-xs tabular-nums text-muted-foreground">
							{series.year}
						</span>
						<span className="text-xs text-muted-foreground">
							{series.sets.length}
						</span>
					</Link>
					<div className="ml-4 border-l border-border pl-3">
						{series.sets.map((set) => (
							<Link
								key={set.id}
								to="/$series/$set"
								params={{ series: series.slug, set: set.slug }}
								search={{
									q: "",
									types: [],
									rarity: [],
									supertype: [],
									subtypes: [],
									scope: "all",
									view: "grid",
								}}
								aria-current={set.slug === activeSetSlug ? "page" : undefined}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary hover:text-foreground",
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
					</div>
				</div>
			))}
		</nav>
	);
}
