import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import {
	useFilterParam,
	usePokedexParam,
	useSetIdParam,
} from "./use-url-selection";

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

	test("returns null for dex=0", () => {
		renderInRouter(<PokedexProbe />, "/?dex=0");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("returns null for negative dex", () => {
		renderInRouter(<PokedexProbe />, "/?dex=-5");
		expect(screen.getByTestId("value").textContent).toBe("null");
	});

	test("returns null for decimal dex", () => {
		renderInRouter(<PokedexProbe />, "/?dex=25.5");
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

function FilterProbe({ name }: { name: string }) {
	const [values, setValues] = useFilterParam(name);
	return (
		<>
			<span data-testid="value">{values.join(",") || "empty"}</span>
			<button type="button" onClick={() => setValues(["fire"])}>
				set-one
			</button>
			<button type="button" onClick={() => setValues(["fire", "water"])}>
				set-two
			</button>
			<button type="button" onClick={() => setValues([])}>
				clear
			</button>
		</>
	);
}

describe("useFilterParam", () => {
	test("reads existing CSV values from URL", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=fire,water");
		expect(screen.getByTestId("value").textContent).toBe("fire,water");
	});

	test("returns empty array when param is absent", () => {
		renderInRouter(<FilterProbe name="types" />, "/");
		expect(screen.getByTestId("value").textContent).toBe("empty");
	});

	test("setValues writes comma-separated to URL", () => {
		renderInRouter(<FilterProbe name="types" />, "/");
		fireEvent.click(screen.getByText("set-two"));
		expect(screen.getByTestId("value").textContent).toBe("fire,water");
	});

	test("setValues with empty array clears the param", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=fire,water");
		fireEvent.click(screen.getByText("clear"));
		expect(screen.getByTestId("value").textContent).toBe("empty");
	});

	test("filters out empty CSV components (e.g. trailing comma)", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=fire,,water,");
		expect(screen.getByTestId("value").textContent).toBe("fire,water");
	});

	test("merges duplicate-key params into the value array", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=fire&types=water");
		expect(screen.getByTestId("value").textContent).toBe("fire,water");
	});

	test("returns empty array for empty value (?types=)", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=");
		expect(screen.getByTestId("value").textContent).toBe("empty");
	});

	test("returns empty array for only-commas value (?types=,,,)", () => {
		renderInRouter(<FilterProbe name="types" />, "/?types=,,,");
		expect(screen.getByTestId("value").textContent).toBe("empty");
	});
});
