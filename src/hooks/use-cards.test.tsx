import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import type { HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { type CardFetcher, useCards } from "./use-cards";

function card(id: string): HoloCardData {
	return {
		id,
		imageUrl: `https://img/${id}.png`,
		name: id,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id,
	};
}

beforeEach(() => {
	useStore.setState({ cardsCache: {}, cardsCacheOrder: [] });
});
afterEach(() => {
	useStore.setState({ cardsCache: {}, cardsCacheOrder: [] });
});

describe("useCards", () => {
	test("loads page 1 on first selection", async () => {
		const fetcher: CardFetcher = mock(async () => ({
			cards: [card("a"), card("b")],
			totalCount: 2,
		}));
		const { result } = renderHook(() => useCards("base1", fetcher));
		await waitFor(() => expect(result.current.cards.length).toBe(2));
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(result.current.hasMore).toBe(false);
	});

	test("does not refetch when the cached entry is fresh", async () => {
		useStore.setState({
			cardsCache: {
				base1: {
					cards: [card("a")],
					page: 1,
					totalCount: 1,
					fetchedAt: Date.now(),
				},
			},
			cardsCacheOrder: ["base1"],
		});
		const fetcher: CardFetcher = mock(async () => ({
			cards: [],
			totalCount: 0,
		}));
		const { result } = renderHook(() => useCards("base1", fetcher));
		await waitFor(() => expect(result.current.cards.length).toBe(1));
		expect(fetcher).not.toHaveBeenCalled();
	});

	test("revalidates in the background when the cached entry is stale", async () => {
		useStore.setState({
			cardsCache: {
				base1: {
					cards: [card("a")],
					page: 1,
					totalCount: 1,
					fetchedAt: Date.now() - 48 * 60 * 60 * 1000,
				},
			},
			cardsCacheOrder: ["base1"],
		});
		const fetcher: CardFetcher = mock(async () => ({
			cards: [card("a")],
			totalCount: 1,
		}));
		renderHook(() => useCards("base1", fetcher));
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
	});
});
