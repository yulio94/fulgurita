/**
 * Words per printed page, by output format. The statusbar estimate and the
 * format profiles read these same numbers. Duplicated, the estimate and the
 * real export would be free to contradict each other.
 */
export const WORDS_PER_PAGE = {
	/** 6×9 trade paperback. */
	trade6x9: 300,
	/** Courier 12pt double spaced — what an agent or an editor receives. */
	manuscript: 250,
} as const;

/** Pages a word count fills at a given density. An empty project has no pages. */
export function estimatePages(words: number, wordsPerPage: number): number {
	return words === 0 ? 0 : Math.max(1, Math.ceil(words / wordsPerPage));
}
