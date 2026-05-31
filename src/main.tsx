import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CardDialog } from "./components/card-dialog/card-dialog";
import { PackDialog } from "./components/pack-dialog/pack-dialog";
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
						{
							path: "card/:id",
							element: <CardDialog />,
							loader: cardLoader,
							errorElement: <CardErrorPage />,
						},
						{ path: "pack/:setId", element: <PackDialog /> },
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
