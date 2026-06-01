import { createServerFn } from "@tanstack/react-start";
import { deriveNavTree, type NavTree } from "../lib/nav-tree";
import { fetchAllSets } from "./card-data";

// Server-only: holds a createServerFn handler. The pure nav-tree API
// (types + deriveNavTree/findSeries/findSet) lives in ../lib/nav-tree and is
// what client islands import. A server fn must never share a module the client
// imports, or the serverfn-split bundler duplicates the module and the RPC
// dispatcher can't find the handler ("Server function info not found").
//
// Re-exported here only for server-side / route convenience (loaders that want
// both getNavTreeFn and findSet from one import). Client code imports from lib.
export {
	deriveNavTree,
	findSeries,
	findSet,
	type NavSeries,
	type NavSet,
	type NavTree,
} from "../lib/nav-tree";

// Memoize across requests in one server process. The sets list changes monthly;
// a process restart (deploy) picks up new sets. Avoids rebuilding the index per request.
let cached: NavTree | null = null;
export const getNavTreeFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<NavTree> => {
		if (cached) return cached;
		const sets = await fetchAllSets();
		cached = deriveNavTree(sets);
		return cached;
	},
);
