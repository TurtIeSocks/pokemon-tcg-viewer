/**
 * Convert a pokeapi-style lowercase-with-hyphens name (e.g. "mr-mime") into
 * a human-readable form ("Mr Mime"). Used for both the search filter and
 * cross-link overlay labels so display matches across the app.
 */
export function displayName(name: string): string {
	if (!name) return "";
	return name
		.split("-")
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(" ");
}
