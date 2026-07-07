// AI vision scan handler (R5, R6). DI-testable: `handleScan` takes an
// optional `ScanDeps` so tests inject fakes — no network, no live SDK
// construction in tests. The real Anthropic client is built lazily inside
// `realVision()`, never at module top level (SSR import cost, per plan).
//
// Entitlement semantics (R5, exact):
//   - !cloudEnabled() -> skip auth entirely, go straight to vision. Self-host
//     open-core: no cloud means no accounts, so the operator's own
//     ANTHROPIC_API_KEY is the only gate and everyone is entitled.
//   - getUser() null -> 401 { error: "not signed in" }
//   - isEntitled() false -> 403 { error: "needs_plus" }
// This is a server-side GATE (unlike src/lib/billing/entitlement.ts, which is
// fail-OPEN and render-only per its R15 invariant) — errors here fail CLOSED.

import { isCloudEnabled } from "@/lib/supabase/client";
import { getServerClient } from "@/lib/supabase/server";

const MAX_BODY_BYTES = 1.5 * 1024 * 1024; // 1.5MB base64, per plan

export interface AiScanResult {
	name: string;
	number: string;
	setTotal: number | null;
	language: string;
	confidence: number;
}

export interface ScanDeps {
	cloudEnabled(): boolean;
	getUser(): Promise<{ id: string } | null>;
	isEntitled(): Promise<boolean>;
	vision(imageBase64: string): Promise<AiScanResult>;
}

// Structured-outputs schema (R6) — guarantees a parseable reply shape.
const SCAN_RESULT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["name", "number", "setTotal", "language", "confidence"],
	properties: {
		name: { type: "string" },
		number: { type: "string" },
		setTotal: { type: ["integer", "null"] },
		language: { type: "string" },
		confidence: { type: "number" },
	},
} as const;

/**
 * Real vision call, built on `@anthropic-ai/sdk` (R6). The SDK is dynamic-
 * imported INSIDE the returned closure, never at module top level, so
 * importing this file has no cost when the route isn't hit and no SDK
 * construction happens under test.
 */
export function realVision(): ScanDeps["vision"] {
	return async (imageBase64: string): Promise<AiScanResult> => {
		const { default: Anthropic } = await import("@anthropic-ai/sdk");
		const client = new Anthropic(); // ANTHROPIC_API_KEY from env
		const model = process.env.SCAN_MODEL || "claude-haiku-4-5"; // R6
		const response = await client.messages.create({
			model,
			max_tokens: 300,
			output_config: {
				format: { type: "json_schema", schema: SCAN_RESULT_SCHEMA },
			},
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/jpeg",
								data: imageBase64,
							},
						},
						{
							type: "text",
							text: 'Identify this Pokemon trading card. Return the card name exactly as printed, the collector number (numerator only, e.g. "86" from "086/198", or the full promo id like "SWSH123"), the printed set total as an integer (null if none is printed), the card language as a BCP-47-ish code (en, ja, fr...), and your confidence 0-1.',
						},
					],
				},
			],
		});
		const text = response.content.find((b) => b.type === "text");
		if (!text || text.type !== "text") throw new Error("no text block");
		return JSON.parse(text.text) as AiScanResult;
	};
}

/** Real deps, built lazily inside the route handler (never at module top level). */
export function realScanDeps(): ScanDeps {
	return {
		cloudEnabled: isCloudEnabled,
		async getUser() {
			const {
				data: { user },
			} = await getServerClient().auth.getUser();
			return user ? { id: user.id } : null;
		},
		async isEntitled() {
			try {
				const { data, error } = await getServerClient().rpc("is_pro_self");
				if (error) {
					console.error("[scan] is_pro_self rpc error:", error.message);
					return false; // fail CLOSED
				}
				return data === true;
			} catch (err) {
				console.error(
					"[scan] is_pro_self rpc threw:",
					err instanceof Error ? err.message : String(err),
				);
				return false; // fail CLOSED
			}
		},
		vision: realVision(),
	};
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/**
 * DI-testable handler logic (R5, R6). `deps` defaults to the real
 * Supabase/Anthropic-backed implementation; tests always pass fakes.
 */
export async function handleScan(
	request: Request,
	deps: ScanDeps = realScanDeps(),
): Promise<Response> {
	if (!process.env.ANTHROPIC_API_KEY) {
		return jsonResponse(503, { error: "scan not configured" });
	}

	let body: unknown;
	try {
		const rawText = await request.text();
		if (rawText.length > MAX_BODY_BYTES) {
			return jsonResponse(413, { error: "image too large" });
		}
		body = JSON.parse(rawText);
	} catch {
		return jsonResponse(400, { error: "invalid request body" });
	}

	const imageBase64 =
		typeof body === "object" && body !== null && "imageBase64" in body
			? (body as { imageBase64: unknown }).imageBase64
			: undefined;
	if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
		return jsonResponse(400, { error: "invalid request body" });
	}
	if (imageBase64.length > MAX_BODY_BYTES) {
		return jsonResponse(413, { error: "image too large" });
	}
	// Cheap poison-pill guard: reject anything that isn't valid base64
	// charset BEFORE it ever reaches the vision call. A non-base64 string
	// would still cost a full Anthropic round trip (and dollars, R6 margin)
	// only to fail upstream; this catches it for the price of a regex.
	if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
		return jsonResponse(400, { error: "invalid request body" });
	}

	if (deps.cloudEnabled()) {
		try {
			const user = await deps.getUser();
			if (!user) {
				return jsonResponse(401, { error: "not signed in" });
			}
			const entitled = await deps.isEntitled();
			if (!entitled) {
				return jsonResponse(403, { error: "needs_plus" });
			}
		} catch (err) {
			// getUser/isEntitled reaching this catch means Supabase itself is
			// unreachable/erroring, not a normal auth-denied outcome (those are
			// the 401/403 branches above). Fail closed with a terse 503 and log
			// forensics server-side only -- never the image payload.
			console.error(
				"[scan] auth/entitlement check threw:",
				err instanceof Error ? err.message : String(err),
			);
			return jsonResponse(503, { error: "auth unavailable" });
		}
	}
	// !cloudEnabled() -> self-host open-core: skip auth/entitlement entirely (R5).

	try {
		const result = await deps.vision(imageBase64);
		return jsonResponse(200, result as unknown as Record<string, unknown>);
	} catch (err) {
		console.error(
			// Never log the image payload — length only.
			`[scan] vision call failed (imageBase64 length=${imageBase64.length}):`,
			err instanceof Error ? err.message : String(err),
		);
		return jsonResponse(502, { error: "scan failed" });
	}
}
