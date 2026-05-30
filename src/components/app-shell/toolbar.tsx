import { Menu, Package } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { useSets } from "../../hooks/use-sets";
import { useSetIdParam } from "../../hooks/use-url-selection";
import { InstallPrompt } from "../install-prompt";
import { OfflineIndicator } from "../offline-indicator";
import { SeriesSidebar } from "../series-sidebar/series-sidebar";

export function Toolbar() {
	const sets = useSets();
	const [selectedSetId] = useSetIdParam();
	const navigate = useNavigate();
	const currentSet = sets.find((s) => s.id === selectedSetId);

	return (
		<header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
			<div className="flex min-w-0 items-center gap-3">
				<Sheet>
					<SheetTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="lg:hidden"
							aria-label="Open sidebar"
						>
							<Menu className="size-5" />
						</Button>
					</SheetTrigger>
					<SheetContent side="left" className="w-72 p-0">
						<SheetTitle className="sr-only">Series & sets</SheetTitle>
						<SeriesSidebar />
					</SheetContent>
				</Sheet>
				<Link
					to="/"
					aria-label="Pokémon TCG Holo Playground — home"
					className="flex shrink-0 items-center gap-2"
				>
					<img
						src={`${import.meta.env.BASE_URL}logo-64.png`}
						alt=""
						className="size-8 shrink-0"
					/>
					<span className="hidden text-lg font-bold sm:block">
						Pokémon TCG Holo Playground
					</span>
				</Link>
				{currentSet && (
					<div className="hidden min-w-0 items-center gap-2 border-l border-border pl-3 md:flex">
						<img
							src={currentSet.images.logo}
							alt=""
							className="h-7 object-contain"
						/>
						<div className="min-w-0">
							<div className="truncate text-sm font-medium">
								{currentSet.name}
							</div>
							<div className="truncate text-xs text-muted-foreground">
								{currentSet.series} · {currentSet.total} cards
							</div>
						</div>
					</div>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<OfflineIndicator />
				<InstallPrompt />
				<Button
					variant="outline"
					disabled={!selectedSetId}
					onClick={() => selectedSetId && navigate(`/pack/${selectedSetId}`)}
				>
					<Package className="size-4 sm:mr-2" />
					<span className="hidden sm:inline">Open Packs</span>
				</Button>
				<Button variant="outline" asChild>
					<Link to="/collection">Collection</Link>
				</Button>
			</div>
		</header>
	);
}
