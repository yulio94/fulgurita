import type { Doc } from "../types";

/**
 * The colors a tag can be drawn in. Six is enough to tell POV from subplot from
 * timeline, and short enough to fit one dropdown without scrolling.
 *
 * These are names, not colors: `sietch.json` stores the name, so changing the
 * theme restyles every chip. The values live in `styles/theme.css` as
 * `--tag-{name}`.
 */
export const TAG_COLORS = [
	"clay",
	"olive",
	"water",
	"plum",
	"ember",
	"sky",
] as const;

/**
 * The CSS value that paints a tag's dot, or `""` for a tag with no color and
 * for a name this version does not know.
 *
 * The lookup is what makes a hand-edited `sietch.json` harmless: the result is
 * always a constant from the list above, so a junk color name paints nothing
 * rather than reaching a stylesheet.
 */
export function tagColorVar(color: string | undefined): string {
	return TAG_COLORS.includes(color as (typeof TAG_COLORS)[number])
		? `var(--tag-${color})`
		: "";
}

/**
 * Every tag used anywhere in the project except the ones already on this
 * chapter, for the Inspector's `<datalist>`.
 *
 * `documents` is already a project-wide tag index: `list_chapters` fills
 * `ChapterMeta.tags`, `toDoc` maps it, and every write path re-maps through
 * `toDoc`. Nothing new has to be loaded to offer a suggestion.
 */
export function suggestTags(docs: Doc[], current: string[]): string[] {
	const taken = new Set(current.map((tag) => tag.toLowerCase()));
	const out = new Map<string, string>();
	for (const doc of docs) {
		for (const tag of doc.tags) {
			const key = tag.toLowerCase();
			if (!taken.has(key)) out.set(key, tag);
		}
	}
	return [...out.values()].sort((a, b) => a.localeCompare(b));
}
