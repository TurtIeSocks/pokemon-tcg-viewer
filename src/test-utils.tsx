import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { HoloCardData } from "./components/holo-card";
import type { FocusCardData } from "./server/card-mappers";
import { buildIndex } from "./store/corpus/corpus-engine";
import { useCorpusRuntime } from "./store/corpus/corpus-runtime";
import type { CorpusCard } from "./store/corpus/corpus-types";
import { createIdbRepos } from "./store/userland/idb-repo";
import type {
	Binder,
	Profile,
	Stack,
	UserDataSnapshot,
} from "./store/userland/types";
import {
	resetUserlandForTests,
	setUserlandRepos,
} from "./store/userland/userland-store";

/**
 * Render `ui` inside a minimal in-memory TanStack router so components that use
 * `<Link>` or router hooks work under test. Shared by the component tests that
 * previously each defined an identical copy of this wrapper.
 */
export async function renderInRouter(ui: ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

// --- Test fixture factories --------------------------------------------------
// Each returns a fully-populated object (every key present; null for "unknown")
// and accepts a `Partial` override. Pass the fields a test asserts on as
// overrides; leave the rest to the defaults. Ids auto-increment for uniqueness.

let idSeq = 0;
const nextId = (prefix: string): string => `${prefix}-${++idSeq}`;

/** A render-ready card (corpus-joined shape consumed by `<HoloCard>`). */
export function makeCard(overrides: Partial<HoloCardData> = {}): HoloCardData {
	const id = overrides.id ?? nextId("card");
	return {
		id,
		imageUrl: `https://img.test/${id}.png`,
		imageUrlSmall: `https://img.test/${id}-sm.png`,
		name: id,
		rarity: "Common",
		subtypes: [],
		types: [],
		supertype: "Pokémon",
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		setReleaseDate: "1999/01/09",
		cardNumber: "1",
		nationalPokedexNumbers: [],
		variants: [],
		...overrides,
	};
}

/** A raw corpus card (the trimmed metadata stored in the local index). */
export function makeCorpusCard(
	overrides: Partial<CorpusCard> = {},
): CorpusCard {
	const id = overrides.id ?? nextId("card");
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId: "base1",
		number: "1",
		...overrides,
	};
}

/** A focus/detail card (FocusCardData) with sensible defaults; override any field. */
export function makeFocusCard(
	overrides: Partial<FocusCardData> = {},
): FocusCardData {
	const id = overrides.id ?? nextId("card");
	return {
		id,
		imageUrl: `https://img.test/${id}.png`,
		name: id,
		supertype: "Pokémon",
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: "1",
		...overrides,
	};
}

/** One owned physical stack, every key present (null = unknown). pricePaid is in cents. */
export function makeStack(overrides: Partial<Stack> = {}): Stack {
	const now = Date.now();
	return {
		id: overrides.id ?? nextId("stack"),
		cardId: overrides.cardId ?? nextId("card"),
		quantity: 1,
		acquiredAt: now,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		label: null,
		pricePaid: null,
		currency: "USD",
		language: "en",
		variant: null,
		notes: null,
		condition: null,
		grading: null,
		source: null,
		storageLocation: null,
		isPrimary: false,
		...overrides,
	};
}

/** A binder with empty hybrid membership (no rules, no manual include/exclude). */
export function makeBinder(overrides: Partial<Binder> = {}): Binder {
	const now = Date.now();
	const id = overrides.id ?? nextId("binder");
	return {
		id,
		name: id,
		description: null,
		rules: [],
		includeCardIds: [],
		excludeCardIds: [],
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		...overrides,
	};
}

/** A profile fixture, every key present; override any field. */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
	const now = Date.now();
	return {
		id: "me",
		displayName: "Collector",
		bio: null,
		avatarPreset: "dusk",
		favoriteSetId: null,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		...overrides,
	};
}

/** A current (v5) import/export envelope from the given stacks + binders (+ optional profile). */
export function makeSnapshot(
	collection: Stack[] = [],
	binders: Binder[] = [],
	profile: Profile | null = null,
): UserDataSnapshot {
	return {
		schemaVersion: 5,
		exportedAt: Date.now(),
		collection,
		binders,
		profile,
	};
}

/**
 * Seed the in-memory corpus index from `cards` so `loadCorpus()` early-returns
 * (no `fetch('/corpus')` in tests). Call in a test/`beforeEach` before rendering
 * any component that renders a card grid.
 */
export function seedCorpus(cards: CorpusCard[]): void {
	useCorpusRuntime.setState({ index: buildIndex(cards) });
}

/**
 * Seed the corpus with a single card derived from a focus-card fixture, so a
 * detail/modal component's `loadCorpus()` early-returns without network.
 */
export function seedCorpusFor(card: FocusCardData): void {
	seedCorpus([
		makeCorpusCard({
			id: card.id,
			name: card.name,
			setId: card.setId,
			number: card.cardNumber,
		}),
	]);
}

/**
 * Fresh IDB-backed userland repos, cleared and wired into the store, with the
 * store cache reset. Returns the repos for tests that need direct access. Call
 * from `beforeEach` — replaces the 7-line create/clear/wire/reset block that was
 * copy-pasted across ~22 userland test files.
 */
export async function setupUserlandTest(): Promise<
	ReturnType<typeof createIdbRepos>
> {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	await repos.profile.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	return repos;
}

/** The repos bundle returned by {@link setupUserlandTest}. */
export type UserlandTestRepos = Awaited<ReturnType<typeof setupUserlandTest>>;
