export interface VersionEnv {
	APP_VERSION?: string;
	VERCEL_GIT_COMMIT_SHA?: string;
	CF_PAGES_COMMIT_SHA?: string;
	GITHUB_SHA?: string;
}

/**
 * Resolve the build token. First non-empty wins:
 * explicit override → CI commit SHAs → local git → build timestamp.
 * SHAs are truncated to 7 chars; an explicit override and the timestamp are not.
 */
export function resolveVersion(
	env: VersionEnv,
	runGit: () => string | null,
	now: () => number = () => Date.now(),
): string {
	if (env.APP_VERSION) return env.APP_VERSION;
	const sha =
		env.VERCEL_GIT_COMMIT_SHA ||
		env.CF_PAGES_COMMIT_SHA ||
		env.GITHUB_SHA ||
		runGit();
	return sha ? sha.slice(0, 7) : String(now());
}
