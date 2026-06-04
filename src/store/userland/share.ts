// src/store/userland/share.ts
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { Binder, Stack } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SnapshotCard {
	cardId: string;
	owned: boolean;
	condition?: string;
	grade?: string;
}

export interface BinderSnapshot {
	v: 1;
	name: string;
	description: string | null;
	sharedAt: number;
	scope: "all" | "owned" | "needed";
	cards: SnapshotCard[];
}

export interface BuildSnapshotInput {
	binder: Binder;
	members: Set<string>;
	ownedCardIds: Set<string>;
	stacksByCard: Map<string, Stack[]>;
	scope: "all" | "owned" | "needed";
	includeGrades: boolean;
	sharedAt: number;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** Pick the "best" stack for a card: primary stack first, else earliest createdAt. */
function bestStack(stacks: Stack[]): Stack | undefined {
	if (!stacks.length) return undefined;
	const primary = stacks.find((c) => c.isPrimary);
	if (primary) return primary;
	return stacks.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
}

/** Builds a serialisable snapshot of a binder's cards for URL sharing. */
export function buildSnapshot(input: BuildSnapshotInput): BinderSnapshot {
	const {
		binder,
		members,
		ownedCardIds,
		stacksByCard,
		scope,
		includeGrades,
		sharedAt,
	} = input;

	// Stable order: sort the cardIds
	const sorted = [...members].sort();

	const cards: SnapshotCard[] = [];

	for (const cardId of sorted) {
		const owned = ownedCardIds.has(cardId);

		// Scope filter
		if (scope === "owned" && !owned) continue;
		if (scope === "needed" && owned) continue;

		const card: SnapshotCard = { cardId, owned };

		if (includeGrades && owned) {
			const stacks = stacksByCard.get(cardId);
			const stack = stacks ? bestStack(stacks) : undefined;
			if (stack) {
				// condition — omit key when null
				if (stack.condition != null) {
					card.condition = stack.condition;
				}
				// grade — omit key when no grading
				if (stack.grading != null) {
					card.grade = `${stack.grading.company} ${stack.grading.grade}`;
				}
			}
		}
		// NEVER include pricePaid or notes — they are never read here

		cards.push(card);
	}

	return {
		v: 1,
		name: binder.name,
		description: binder.description,
		sharedAt,
		scope,
		cards,
	};
}

// ---------------------------------------------------------------------------
// Encode / Decode
// ---------------------------------------------------------------------------

// btoa/atob are universal (browser + Bun + happy-dom); Buffer is Node-only and
// crashes in the browser — this code runs client-side (share dialog + /vault/shared).
function toBase64Url(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
	// Restore standard base64 padding
	const padded = s.replace(/-/g, "+").replace(/_/g, "/");
	const pad = (4 - (padded.length % 4)) % 4;
	const bin = atob(padded + "=".repeat(pad));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

/** Deflate-compresses and base64url-encodes a snapshot for embedding in a URL hash. */
export function encodeSnapshot(s: BinderSnapshot): string {
	const json = JSON.stringify(s);
	const compressed = deflateSync(strToU8(json));
	return toBase64Url(compressed);
}

/** Type guard: returns true only when `v` is a structurally valid {@link BinderSnapshot}. */
export function isValidSnapshot(v: unknown): v is BinderSnapshot {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	if (o.v !== 1) return false;
	if (typeof o.name !== "string") return false;
	if (typeof o.description !== "string" && o.description !== null) return false;
	if (o.scope !== "all" && o.scope !== "owned" && o.scope !== "needed")
		return false;
	if (typeof o.sharedAt !== "number" || !Number.isFinite(o.sharedAt))
		return false;
	if (!Array.isArray(o.cards)) return false;
	if (o.cards.length > 50_000) return false;
	for (const c of o.cards) {
		if (typeof c !== "object" || c === null) return false;
		const card = c as Record<string, unknown>;
		if (typeof card.cardId !== "string") return false;
		if (typeof card.owned !== "boolean") return false;
	}
	return true;
}

/** Decodes a base64url + deflate-encoded string back into a {@link BinderSnapshot}; throws on invalid input. */
export function decodeSnapshot(encoded: string): BinderSnapshot {
	if (encoded.length > 100_000) throw new Error("Invalid binder snapshot");
	try {
		const compressed = fromBase64Url(encoded);
		const json = strFromU8(inflateSync(compressed));
		const parsed: unknown = JSON.parse(json);
		if (!isValidSnapshot(parsed)) throw new Error("Invalid binder snapshot");
		return parsed;
	} catch (err) {
		if (err instanceof Error && err.message === "Invalid binder snapshot") {
			throw err;
		}
		throw new Error("Invalid binder snapshot");
	}
}
