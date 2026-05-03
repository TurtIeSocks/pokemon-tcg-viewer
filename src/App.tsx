import { CardZoomModal } from "pokemon-holo-cards";
import { NavLink, Route, Routes } from "react-router";
import "./App.css";
import { PokemonPage } from "./pages/PokemonPage";
import { SetsPage } from "./pages/SetsPage";

export default function App() {
	return (
		<div className="app">
			<CardZoomModal />
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
					By Pokémon
				</NavLink>
			</nav>
			<Routes>
				<Route path="/" element={<SetsPage />} />
				<Route path="/pokemon" element={<PokemonPage />} />
			</Routes>
		</div>
	);
}
