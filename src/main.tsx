import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CardErrorPage } from "./pages/card-error-page";
import { cardLoader } from "./pages/card-loader";
import { CardPage } from "./pages/card-page";
import { CollectionPage } from "./pages/collection-page";
import { PackPage } from "./pages/pack-page";
import { PokemonPage } from "./pages/pokemon-page";
import { SetsPage } from "./pages/sets-page";
import { RootLayout } from "./root-layout";

const router = createBrowserRouter(
	[
		{
			path: "/",
			element: <RootLayout />,
			children: [
				{ index: true, element: <SetsPage /> },
				{ path: "collection", element: <CollectionPage /> },
				{ path: "pokemon", element: <PokemonPage /> },
				{ path: "pack/:setId", element: <PackPage /> },
				{
					path: "card/:id",
					element: <CardPage />,
					loader: cardLoader,
					errorElement: <CardErrorPage />,
				},
			],
		},
	],
	{ basename: import.meta.env.BASE_URL },
);

// biome-ignore lint/style/noNonNullAssertion: known to be there
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
