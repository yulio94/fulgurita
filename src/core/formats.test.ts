import { expect, test } from "vitest";
import { estimatePages, WORDS_PER_PAGE } from "./formats";

// A page that is one line in is still a page you turn.
test("a partial page counts as a whole one", () => {
	expect(estimatePages(2320, WORDS_PER_PAGE.trade6x9)).toBe(8);
	expect(estimatePages(2320, WORDS_PER_PAGE.manuscript)).toBe(10);
	expect(estimatePages(600, WORDS_PER_PAGE.trade6x9)).toBe(2);
});

test("a single word already fills a page", () => {
	expect(estimatePages(1, WORDS_PER_PAGE.trade6x9)).toBe(1);
});

// Rounding a blank project up to one page would claim a book that is not there.
test("an empty project has no pages", () => {
	expect(estimatePages(0, WORDS_PER_PAGE.trade6x9)).toBe(0);
});
