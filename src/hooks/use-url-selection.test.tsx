import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { usePokedexParam, useSetIdParam } from "./use-url-selection";

function SetIdProbe() {
	const [setId, setSetId] = useSetIdParam();
	return (
		<>
			<span data-testid="value">{setId ?? "null"}</span>
			<button type="button" onClick={() => setSetId("swsh4")}>
				set
			</button>
			<button type="button" onClick={() => setSetId(null)}>
				clear
			</button>
		</>
	);
}

function PokedexProbe() {
	const [dex, setDex] = usePokedexParam();
	return (
		<>
			<span data-testid="value">{dex === null ? "null" : String(dex)}</span>
			<button type="button" onClick={() => setDex(25)}>
				set
			</button>
			<button type="button" onClick={() => setDex(null)}>
				clear
			</button>
		</>
	);
}

function renderInRouter(ui: React.ReactElement, initialUrl: string) {
	return render(
		<MemoryRouter initialEntries={[initialUrl]}>{ui}</MemoryRouter>,
	);
}

describe("useSetIdParam", () => {
	test("reads existing setId from URL", () => {
		renderInRouter(<SetIdProbe />, "/?setId=base1");
		expect(screen.getByTestId("value").textContent).toBe("base1");
	});

	test("returns null when setId is absent", () => {
		renderInRouter(<SetIdProbe />, "/");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("setSetId writes to URL", () => {
		renderInRouter(<SetIdProbe />, "/");
		fireEvent.click(screen.getByText("set"));
		expect(screen.getByTestId("value").textContent).toBe("swsh4");
	});

	test("setSetId(null) clears the param", () => {
		renderInRouter(<SetIdProbe />, "/?setId=base1");
		fireEvent.click(screen.getByText("clear"));
		expect(screen.getByTestId("value").textContent).toBe("null");
	});
});

describe("usePokedexParam", () => {
	test("reads existing dex from URL as a number", () => {
		renderInRouter(<PokedexProbe />, "/?dex=25");
		expect(screen.getByTestId("value").textContent).toBe("25");
	});

	test("returns null for missing param", () => {
		renderInRouter(<PokedexProbe />, "/");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("returns null for non-numeric dex", () => {
		renderInRouter(<PokedexProbe />, "/?dex=pikachu");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("setDex writes the number to URL", () => {
		renderInRouter(<PokedexProbe />, "/");
		fireEvent.click(screen.getByText("set"));
		expect(screen.getByTestId("value").textContent).toBe("25");
	});

	test("setDex(null) clears the param", () => {
		renderInRouter(<PokedexProbe />, "/?dex=25");
		fireEvent.click(screen.getByText("clear"));
		expect(screen.getByTestId("value").textContent).toBe("null");
	});
});
