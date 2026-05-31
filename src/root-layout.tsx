import { Outlet, ScrollRestoration } from "react-router";
import "./app.css";
import { Toolbar } from "./components/app-shell/toolbar";
import { SeriesSidebar } from "./components/series-sidebar/series-sidebar";

export function RootLayout() {
	return (
		<div className="flex h-screen flex-col overflow-hidden">
			<ScrollRestoration />
			<Toolbar />
			<div className="flex min-h-0 flex-1">
				<aside className="hidden w-72 shrink-0 border-r border-border bg-sidebar lg:block">
					<SeriesSidebar />
				</aside>
				{/* Non-scrolling flex column; each page fills it and owns its own
				    scroll (the virtual grid is a flex:1 internal scroller). */}
				<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
