// DI-free hook test: mocks global fetch (spyOn), pre-seeds the corpus store
// per the project's "tests must not hit the network" rule. R6/R7.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PokemonSet } from "@/server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime-store";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { useAiScan } from "./use-ai-scan";

const sets = [
	{
		id: "sv1",
		name: "Scarlet & Violet",
		series: "SV",
		releaseDate: "2023-03-31",
		printedTotal: 198,
		total: 258,
		images: {},
	},
] satisfies PokemonSet[];

const card = (
	id: string,
	name: string,
	number: string,
	setId: string,
): CorpusCard => ({
	id,
	name,
	number,
	setId,
	imageUrl: "",
	imageUrlSmall: "",
	supertype: "Pokémon",
});

const cards = [card("sv1-86", "Skiddo", "86", "sv1")];

let fetchSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
	useCorpusRuntime.setState({ index: buildIndex(cards) });
	useStore.setState({ sets });
});

afterEach(() => {
	useCorpusRuntime.setState({ index: null });
	useStore.setState({ sets: null });
	fetchSpy?.mockRestore();
	fetchSpy = null;
});

function mockFetchOnce(status: number, body: unknown) {
	fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		}),
	);
}

describe("useAiScan", () => {
	test("200 maps the AI vision result through matchScan against the corpus", async () => {
		mockFetchOnce(200, {
			name: "Skiddo",
			number: "86",
			setTotal: 198,
			language: "en",
			confidence: 0.9,
		});
		const { result } = renderHook(() => useAiScan());

		let candidates: Awaited<ReturnType<typeof result.current.run>> = [];
		await act(async () => {
			candidates = await result.current.run("base64jpeg");
		});

		expect(candidates.length).toBeGreaterThan(0);
		expect(candidates[0]?.cardId).toBe("sv1-86");
		expect(result.current.state).toBe("idle");

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy?.mock.calls[0] ?? [];
		expect(url).toBe("/api/scan");
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({
			imageBase64: "base64jpeg",
		});
	});

	test("401 sets state to unauthorized and returns no candidates", async () => {
		mockFetchOnce(401, { error: "not signed in" });
		const { result } = renderHook(() => useAiScan());

		let candidates: Awaited<ReturnType<typeof result.current.run>> = [];
		await act(async () => {
			candidates = await result.current.run("base64jpeg");
		});

		expect(candidates).toEqual([]);
		expect(result.current.state).toBe("unauthorized");
	});

	test("403 sets state to needs_plus and returns no candidates", async () => {
		mockFetchOnce(403, { error: "needs_plus" });
		const { result } = renderHook(() => useAiScan());

		let candidates: Awaited<ReturnType<typeof result.current.run>> = [];
		await act(async () => {
			candidates = await result.current.run("base64jpeg");
		});

		expect(candidates).toEqual([]);
		expect(result.current.state).toBe("needs_plus");
	});

	test("500 sets state to error and returns no candidates", async () => {
		mockFetchOnce(500, { error: "scan failed" });
		const { result } = renderHook(() => useAiScan());

		let candidates: Awaited<ReturnType<typeof result.current.run>> = [];
		await act(async () => {
			candidates = await result.current.run("base64jpeg");
		});

		expect(candidates).toEqual([]);
		expect(result.current.state).toBe("error");
	});

	test("a network throw also lands in error state", async () => {
		fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("network down"),
		);
		const { result } = renderHook(() => useAiScan());

		let candidates: Awaited<ReturnType<typeof result.current.run>> = [];
		await act(async () => {
			candidates = await result.current.run("base64jpeg");
		});

		expect(candidates).toEqual([]);
		expect(result.current.state).toBe("error");
	});

	test("state is loading while the request is in flight", async () => {
		let resolveFetch!: (res: Response) => void;
		fetchSpy = spyOn(globalThis, "fetch").mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			}) as unknown as Promise<Response>,
		);
		const { result } = renderHook(() => useAiScan());

		let runPromise!: ReturnType<typeof result.current.run>;
		act(() => {
			runPromise = result.current.run("base64jpeg");
		});
		await waitFor(() => expect(result.current.state).toBe("loading"));

		await act(async () => {
			resolveFetch(
				new Response(
					JSON.stringify({
						name: "Skiddo",
						number: "86",
						setTotal: 198,
						language: "en",
						confidence: 0.9,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);
			await runPromise;
		});
	});
});
