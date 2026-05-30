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
				<main className="min-w-0 flex-1 overflow-y-auto">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
