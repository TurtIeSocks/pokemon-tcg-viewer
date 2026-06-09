import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { VersionToast } from "./version-toast";

beforeEach(() => {
	(globalThis as Record<string, unknown>).__APP_VERSION__ = "boot-v1";
});

afterEach(() => {
	mock.restore();
	delete (globalThis as Record<string, unknown>).__APP_VERSION__;
});

test("fires a toast with a Reload action when an update is available", async () => {
	spyOn(globalThis, "fetch").mockResolvedValue({
		ok: true,
		json: async () => ({ version: "new-v2" }),
	} as unknown as Response);

	const notify = mock((_message: string, _data?: unknown) => "id");
	render(
		<VersionToast
			notify={notify}
			options={{ enabled: true, intervalMs: 10_000 }}
		/>,
	);

	await waitFor(() => expect(notify).toHaveBeenCalled());
	const [message, data] = notify.mock.calls[0] as [
		string,
		{ action: { label: string }; duration: number },
	];
	expect(message).toBe("New version available");
	expect(data.action.label).toBe("Reload");
	expect(data.duration).toBe(Number.POSITIVE_INFINITY);
});
