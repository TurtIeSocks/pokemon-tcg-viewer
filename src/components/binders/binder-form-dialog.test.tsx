import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { BinderFormDialog } from "./binder-form-dialog";

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("renders open with title and name field", () => {
	render(<BinderFormDialog open={true} onOpenChange={() => {}} />);
	expect(screen.getByRole("dialog")).toBeTruthy();
	expect(screen.getByRole("heading", { name: /new binder/i })).toBeTruthy();
	expect(screen.getByLabelText(/name/i)).toBeTruthy();
});

test("empty name shows 'Name is required' error with role=alert, not [object Object]", async () => {
	render(<BinderFormDialog open={true} onOpenChange={() => {}} />);
	const nameInput = screen.getByLabelText(/name/i);
	// Touch and blur without filling
	fireEvent.change(nameInput, { target: { value: "" } });
	fireEvent.blur(nameInput);
	fireEvent.click(screen.getByRole("button", { name: /create/i }));

	const errorEl = await screen.findByRole("alert");
	expect(errorEl.textContent).toBe("Name is required");
	expect(errorEl.textContent).not.toBe("[object Object]");
});

test("filling name + submitting calls createBinder then onOpenChange(false)", async () => {
	const onOpenChange = mock(() => {});
	render(
		<BinderFormDialog open={true} onOpenChange={onOpenChange} />,
	);
	fireEvent.change(screen.getByLabelText(/name/i), {
		target: { value: "Base Set Complete" },
	});
	// biome-ignore lint/style/noNonNullAssertion: form always present
	fireEvent.submit(document.querySelector("form")!);
	await waitFor(() => {
		const binders = Object.values(useUserland.getState().binders);
		expect(binders.some((b) => b.name === "Base Set Complete")).toBe(true);
	});
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("submit calls onSaved with the created binder", async () => {
	let savedBinder: unknown = null;
	render(
		<BinderFormDialog
			open={true}
			onOpenChange={() => {}}
			onSaved={(b) => {
				savedBinder = b;
			}}
		/>,
	);
	fireEvent.change(screen.getByLabelText(/name/i), {
		target: { value: "My Binder" },
	});
	fireEvent.click(screen.getByRole("button", { name: /create/i }));
	await waitFor(() => {
		expect(savedBinder).not.toBeNull();
		expect((savedBinder as { name: string }).name).toBe("My Binder");
	});
});

test("empty description is stored as null", async () => {
	render(<BinderFormDialog open={true} onOpenChange={() => {}} />);
	fireEvent.change(screen.getByLabelText(/name/i), {
		target: { value: "No Desc Binder" },
	});
	// Leave description empty
	// biome-ignore lint/style/noNonNullAssertion: form always present
	fireEvent.submit(document.querySelector("form")!);
	await waitFor(() => {
		const binders = Object.values(useUserland.getState().binders);
		const created = binders.find((b) => b.name === "No Desc Binder");
		expect(created).toBeTruthy();
		expect(created?.description).toBeNull();
	});
});

test("edit mode: shows Save button, prefills name/description, calls updateBinder", async () => {
	const repos = createIdbRepos();
	setUserlandRepos(repos);
	const binder = await repos.binders.create({
		name: "Old Name",
		description: "Old desc",
	});
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	render(
		<BinderFormDialog open={true} onOpenChange={() => {}} binder={binder} />,
	);
	expect(screen.getByRole("heading", { name: /edit binder/i })).toBeTruthy();

	const nameInput = screen.getByLabelText(/name/i);
	expect((nameInput as HTMLInputElement).value).toBe("Old Name");

	fireEvent.change(nameInput, { target: { value: "New Name" } });
	fireEvent.click(screen.getByRole("button", { name: /save/i }));

	await waitFor(() => {
		expect(useUserland.getState().binders[binder.id]?.name).toBe("New Name");
	});
});
