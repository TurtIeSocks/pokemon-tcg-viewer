import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { BrowsePage } from "./pages/browse-page";
import { CardErrorPage } from "./pages/card-error-page";
import { cardLoader } from "./pages/card-loader";
import { CollectionPage } from "./pages/collection-page";
import { HoloDebugPage } from "./pages/holo-debug-page";
import { RootLayout } from "./root-layout";

const router = createBrowserRouter(
	[
		{
			path: "/",
			element: <RootLayout />,
			children: [
				{
					element: <BrowsePage />,
					children: [
						{ index: true, element: null },
						// card dialog — Phase 3 replaces element with <CardDialog/>
						{
							path: "card/:id",
							element: null,
							loader: cardLoader,
							errorElement: <CardErrorPage />,
						},
						// pack dialog — Phase 4 replaces element with <PackDialog/>
						{ path: "pack/:setId", element: null },
					],
				},
				{ path: "collection", element: <CollectionPage /> },
				...(import.meta.env.DEV
					? [{ path: "holo-debug", element: <HoloDebugPage /> }]
					: []),
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
