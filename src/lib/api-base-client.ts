// Client-side API base (browser). The corpus is fetched client-side, so it uses
// the Vite public env var. Server code uses src/server/card-data.ts:apiBase
// (process.env.API_BASE) instead.
const RAW = import.meta.env.VITE_API_BASE as string | undefined;
const API_BASE = RAW
	? RAW.replace(/\/$/, "")
	: "https://pokemon-tcg-proxy.ptcg-viewer.workers.dev";

export function apiBase(): string {
	return API_BASE;
}
