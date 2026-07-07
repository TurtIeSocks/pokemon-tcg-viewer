// DI-mocked tests for the entitlement-gated vision handler (R5, R6). No
// network, no live SDK construction — `ScanDeps` is fully faked per case.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AiScanResult, handleScan, type ScanDeps } from "./scan-handler";

const SAMPLE_RESULT: AiScanResult = {
	name: "Pikachu",
	number: "58",
	setTotal: 102,
	language: "en",
	confidence: 0.92,
};

function fakeDeps(overrides: Partial<ScanDeps> = {}): ScanDeps {
	return {
		cloudEnabled: () => true,
		getUser: async () => ({ id: "user-1" }),
		isEntitled: async () => true,
		vision: async () => SAMPLE_RESULT,
		...overrides,
	};
}

function req(body: unknown): Request {
	return new Request("http://localhost/api/scan", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

describe("handleScan", () => {
	beforeEach(() => {
		process.env.ANTHROPIC_API_KEY = "test-key";
	});

	afterEach(() => {
		if (ORIGINAL_KEY === undefined) {
			delete process.env.ANTHROPIC_API_KEY;
		} else {
			process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
		}
	});

	it("returns 503 when ANTHROPIC_API_KEY is unset, before any auth check", async () => {
		delete process.env.ANTHROPIC_API_KEY;
		const deps = fakeDeps({
			cloudEnabled: () => {
				throw new Error("must not be called");
			},
		});
		const res = await handleScan(req({ imageBase64: "abc" }), deps);
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "scan not configured" });
	});

	it("returns 401 when cloud is enabled and there is no user", async () => {
		const deps = fakeDeps({ getUser: async () => null });
		const res = await handleScan(req({ imageBase64: "abc" }), deps);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "not signed in" });
	});

	it("returns 403 needs_plus when cloud is enabled, user is signed in, but not entitled", async () => {
		const deps = fakeDeps({ isEntitled: async () => false });
		const res = await handleScan(req({ imageBase64: "abc" }), deps);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "needs_plus" });
	});

	it("skips auth/entitlement entirely and calls vision when cloud is disabled (self-host open-core)", async () => {
		let visionCalled = false;
		const deps = fakeDeps({
			cloudEnabled: () => false,
			getUser: async () => {
				throw new Error("must not be called");
			},
			isEntitled: async () => {
				throw new Error("must not be called");
			},
			vision: async (imageBase64) => {
				visionCalled = true;
				expect(imageBase64).toBe("abc");
				return SAMPLE_RESULT;
			},
		});
		const res = await handleScan(req({ imageBase64: "abc" }), deps);
		expect(res.status).toBe(200);
		expect(visionCalled).toBe(true);
		expect(await res.json()).toEqual(SAMPLE_RESULT);
	});

	it("happy path: cloud enabled, signed in, entitled -> returns vision JSON", async () => {
		const deps = fakeDeps();
		const res = await handleScan(req({ imageBase64: "abc" }), deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(SAMPLE_RESULT);
	});

	it("returns 413 when the body exceeds 1.5MB", async () => {
		const oversized = "a".repeat(1.5 * 1024 * 1024 + 100);
		const deps = fakeDeps({
			vision: async () => {
				throw new Error("must not be called");
			},
		});
		const res = await handleScan(req({ imageBase64: oversized }), deps);
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "image too large" });
	});

	it("returns 502 with a terse body and logs forensics without the image payload when vision throws", async () => {
		const originalError = console.error;
		const logged: unknown[][] = [];
		console.error = (...args: unknown[]) => {
			logged.push(args);
		};
		try {
			const deps = fakeDeps({
				vision: async () => {
					throw new Error("upstream exploded");
				},
			});
			const res = await handleScan(req({ imageBase64: "abc" }), deps);
			expect(res.status).toBe(502);
			expect(await res.json()).toEqual({ error: "scan failed" });
			expect(logged.length).toBeGreaterThan(0);
			const loggedText = logged.map((entry) => entry.join(" ")).join("\n");
			expect(loggedText).not.toContain("abc");
			expect(loggedText).toContain("length=3");
		} finally {
			console.error = originalError;
		}
	});
});
