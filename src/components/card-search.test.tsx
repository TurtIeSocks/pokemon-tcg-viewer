import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardSearch } from "./card-search";

describe("<CardSearch />", () => {
	test("renders the prop value as the input value", () => {
		render(<CardSearch value="charizard" onChange={() => {}} />);
		const input = screen.getByRole("searchbox") as HTMLInputElement;
		expect(input.value).toBe("charizard");
	});

	test("commits the trimmed text after the debounce", async () => {
		const onChange = mock(() => {});
		render(<CardSearch value="" onChange={onChange} debounceMs={10} />);
		fireEvent.change(screen.getByRole("searchbox"), {
			target: { value: "  boss  " },
		});
		await waitFor(() => expect(onChange).toHaveBeenCalledWith("boss"));
	});

	test("Enter commits immediately", () => {
		const onChange = mock(() => {});
		render(<CardSearch value="" onChange={onChange} debounceMs={100000} />);
		const input = screen.getByRole("searchbox");
		fireEvent.change(input, { target: { value: "erika" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onChange).toHaveBeenCalledWith("erika");
	});

	test("clear button resets text and commits empty", () => {
		const onChange = mock(() => {});
		render(
			<CardSearch value="erika" onChange={onChange} debounceMs={100000} />,
		);
		fireEvent.click(screen.getByRole("button", { name: /clear/i }));
		expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
		expect(onChange).toHaveBeenCalledWith("");
	});

	test("does not commit when the trimmed value is unchanged", () => {
		const onChange = mock(() => {});
		render(
			<CardSearch value="erika" onChange={onChange} debounceMs={100000} />,
		);
		const input = screen.getByRole("searchbox");
		fireEvent.change(input, { target: { value: "erika" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onChange).not.toHaveBeenCalled();
	});
});
