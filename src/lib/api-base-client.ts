// Client-side API base (browser). The corpus is fetched client-side, so it uses
// the Vite public env var. Server code uses src/server/card-data.ts:apiBase
// (process.env.API_BASE) instead.
//
// No default here either, and for a sharper reason than on the server: this
// value is baked into every browser bundle at build time, so a fork that ships
// without VITE_API_BASE would point every one of its visitors at the
// maintainer's Worker. Callers reach this from inside their own try/catch
// (loadCorpus falls back to stored IndexedDB bytes), so a missing value
// degrades the corpus rather than white-screening the app.
const RAW = import.meta.env.VITE_API_BASE as string | undefined;
const API_BASE = RAW ? RAW.replace(/\/$/, "") : null;

export function apiBase(): string {
	if (!API_BASE) {
		throw new Error(
			"VITE_API_BASE was not set at build time. Set it to your deployed " +
				"Worker's URL and rebuild (see deploy/DEPLOY.md). It must be a Worker: " +
				"the /corpus* blob routes it serves have no upstream equivalent.",
		);
	}
	return API_BASE;
}
