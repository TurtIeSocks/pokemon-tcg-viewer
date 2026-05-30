/**
 * Escape characters that are significant in pokemontcg.io's Lucene query
 * syntax so a user's raw input can be embedded literally inside a quoted
 * clause like `name:"*<input>*"`. We escape backslash (the escape char
 * itself), double-quote (would close the clause — injection), and the
 * wildcards `*` / `?` (active even inside quotes on pokemontcg.io). The
 * single regex pass is left-to-right over the original string, so a literal
 * backslash becomes `\\` correctly without double-processing.
 */
export function escapeLucene(input: string): string {
	return input.replace(/[\\"*?]/g, (ch) => `\\${ch}`);
}
