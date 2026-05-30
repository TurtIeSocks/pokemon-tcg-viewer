import { NavLink, Outlet, ScrollRestoration } from "react-router";
import "./app.css";
import { InstallPrompt } from "./components/install-prompt";
import { OfflineIndicator } from "./components/offline-indicator";

export function RootLayout() {
	return (
		<div className="app">
			<ScrollRestoration />
			<nav className="primary-nav" aria-label="Filter mode">
				<NavLink
					to="/"
					end
					className={({ isActive }) =>
						isActive ? "primary-nav-link active" : "primary-nav-link"
					}
				>
					By Set
				</NavLink>
				<NavLink
					to="/pokemon"
					className={({ isActive }) =>
						isActive ? "primary-nav-link active" : "primary-nav-link"
					}
				>
					Search
				</NavLink>
				<NavLink
					to="/collection"
					className={({ isActive }) =>
						isActive ? "primary-nav-link active" : "primary-nav-link"
					}
				>
					Collection
				</NavLink>
				<div className="primary-nav-spacer" />
				<OfflineIndicator />
				<InstallPrompt />
			</nav>
			<Outlet />
		</div>
	);
}
