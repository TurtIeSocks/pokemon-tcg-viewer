import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavTree } from "../../server/nav-tree";
import { SidebarCollapsible } from "../islands/sidebar-collapsible";
import { AboutDialog } from "./about-dialog";
import { RepoLink } from "./repo-link";

interface AppToolbarProps {
	tree: NavTree;
	activeSeriesSlug: string | null;
	activeSetSlug: string | null;
}

export function AppToolbar({ tree, activeSeriesSlug, activeSetSlug }: AppToolbarProps) {
	const [open, setOpen] = useState(false);
	return (
		<header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
			<div className="flex min-w-0 items-center gap-3">
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetTrigger asChild>
						<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
							<Menu className="size-5" />
						</Button>
					</SheetTrigger>
					<SheetContent side="left" className="w-72 overflow-y-auto p-0">
						<SheetTitle className="sr-only">Series &amp; sets</SheetTitle>
						<SidebarCollapsible
							tree={tree}
							activeSeriesSlug={activeSeriesSlug}
							activeSetSlug={activeSetSlug}
							onNavigate={() => setOpen(false)}
						/>
					</SheetContent>
				</Sheet>
				<Link to="/" aria-label="Pokémon TCG Holo Playground — home" className="flex shrink-0 items-center gap-2">
					<img src="/logo-64.png" alt="" className="size-8 shrink-0" />
					<span className="hidden text-lg font-bold sm:block">Pokémon TCG Holo Playground</span>
				</Link>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button variant="outline" asChild>
					<Link to="/collection">Collection</Link>
				</Button>
				<AboutDialog />
				<RepoLink />
			</div>
		</header>
	);
}
