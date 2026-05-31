import { useEffect } from "react";
import { Outlet, ScrollRestoration } from "react-router";
import "./app.css";
import { Toolbar } from "./components/app-shell/toolbar";
import { SeriesSidebar } from "./components/series-sidebar/series-sidebar";
import { loadCorpus, useCorpusRuntime } from "./store/corpus/corpus-runtime";

export function RootLayout() {
	useEffect(() => {
		const start = () => void loadCorpus();
		const ric = (
			window as unknown as { requestIdleCallback?: (cb: () => void) => void }
		).requestIdleCallback;
		if (ric) ric(start);
		else setTimeout(start, 1500);
	}, []);

	// App-global indicator while the corpus loads (idle, on first visit). Hidden
	// once the in-memory index is ready — search just becomes instant.
	const preparing = useCorpusRuntime((s) => s.loading && s.index === null);

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
			{preparing && (
				<div
					role="status"
					className="fixed bottom-4 right-4 z-50 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur"
				>
					Preparing instant search…
				</div>
			)}
		</div>
	);
}
