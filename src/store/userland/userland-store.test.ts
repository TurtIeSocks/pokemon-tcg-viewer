// src/store/userland/userland-store.test.ts
import { beforeEach, expect, test } from "bun:test";
import { createIdbRepos } from "./idb-repo";
import {
	loadUserland,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "./userland-store";

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("starts empty and not hydrated", () => {
	const s = useUserland.getState();
	expect(s.items).toEqual({});
	expect(s.goals).toEqual({});
	expect(s.hydrated).toBe(false);
});

test("loadUserland hydrates items and goals from the repo", async () => {
	const repos = createIdbRepos();
	const item = await repos.collection.add({ cardId: "a" });
	const goal = await repos.goals.create({ name: "G" });
	setUserlandRepos(repos);
	resetUserlandForTests();

	await loadUserland();
	const s = useUserland.getState();
	expect(s.hydrated).toBe(true);
	expect(s.items[item.id]?.cardId).toBe("a");
	expect(s.goals[goal.id]?.name).toBe("G");
});

test("loadUserland is idempotent once hydrated", async () => {
	await loadUserland();
	const first = useUserland.getState();
	await loadUserland();
	expect(useUserland.getState().items).toBe(first.items); // same ref, no refetch
});
