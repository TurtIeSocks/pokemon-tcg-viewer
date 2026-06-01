import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { CardGridIsland } from "./card-grid-island";
import type { GridCard } from "./card-grid-island";

const seed: GridCard[] = [
	{ id: "swsh9-1", name: "Exeggcute", imageUrl: "l1", imageUrlSmall: "s1", setId: "swsh9", setName: "BS", setSeries: "S&S", cardNumber: "1" },
];

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("CardGridIsland shows seeded SSR cards before the corpus is ready", async () => {
	await renderInRouter(
		<CardGridIsland
			search={{ q: "", types: [], rarity: [], supertype: [], subtypes: [], scope: "all" }}
			context={{ setId: "swsh9" }}
			seedCards={seed}
			seedTotal={1}
			cardHref={() => ({ to: "/" as const })}
		/>,
	);
	// Under happy-dom the NODE_ENV=test fallback renders a <ul>; HoloCardIsland
	// resolves to the interactive HoloCard (ClientOnly hydrated) which exposes the
	// card name via aria-label on the wrapper div (role=button). Alt text on the
	// internal <img> is intentionally "" (decorative — the aria-label carries the name).
	// This proves the seed card is reachable; production uses Virtuoso (not weakened).
	expect(await screen.findByRole("button", { name: "Exeggcute" })).toBeDefined();
});
