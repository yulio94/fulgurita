import { expect, test } from "vitest";
import type { Doc } from "../types";
import {
	htmlToMarkdown,
	isTitleTaken,
	markdownToHtml,
	nextUntitledTitle,
} from "./chapters";

const CHAPTER = `# Chapter One

The spice extends life. The spice expands consciousness.

## A section

Some **bold** text, some *italic* text, and a \`code\` span.

- First beat
- Second beat

> Fear is the mind-killer.
`;

// Autosave runs on a debounce, so an unstable conversion would rewrite the
// file on every keystroke pause and churn the diff. Converting twice has to
// equal converting once.
test("markdown survives a round trip through the editor unchanged", () => {
	const once = htmlToMarkdown(markdownToHtml(CHAPTER));
	const twice = htmlToMarkdown(markdownToHtml(once));

	expect(twice).toBe(once);

	// A conversion that stably destroys everything would pass the check above
	expect(once).toContain("# Chapter One");
	expect(once).toContain("## A section");
	expect(once).toContain("**bold**");
	// turndown pads list items to a 4-column indent
	expect(once).toContain("-   First beat");
	expect(once).toContain("*italic*");
	expect(once).toContain("> Fear is the mind-killer.");
});

// Every chapter is created as "Untitled", so without a suffix the sidebar is a
// column of identical rows until F-021 adds rename.
test("a new chapter takes the first free Untitled name", () => {
	expect(nextUntitledTitle([], "Untitled")).toBe("Untitled");
	expect(nextUntitledTitle(["Untitled"], "Untitled")).toBe("Untitled 2");
	expect(nextUntitledTitle(["Untitled", "Untitled 2"], "Untitled")).toBe(
		"Untitled 3",
	);
	// A gap left by a deleted chapter gets reused rather than skipped
	expect(nextUntitledTitle(["Untitled", "Untitled 3"], "Untitled")).toBe(
		"Untitled 2",
	);
	// Named chapters never push the counter
	expect(nextUntitledTitle(["Dune", "Muad'Dib"], "Untitled")).toBe("Untitled");
	// The base string is localized, so it must not be hardcoded
	expect(nextUntitledTitle(["Sin titulo"], "Sin titulo")).toBe("Sin titulo 2");
});

// Two chapters sharing a title puts the sidebar back where nextUntitledTitle
// started: rows you cannot tell apart.
test("a rename cannot take a title another chapter already has", () => {
	const docs = [
		{ id: "a", title: "Dune" },
		{ id: "b", title: "Messiah" },
	] as Doc[];

	expect(isTitleTaken(docs, "b", "Dune")).toBe(true);
	expect(isTitleTaken(docs, "b", "Children")).toBe(false);
	// A chapter never blocks itself, or it could not keep its own name
	expect(isTitleTaken(docs, "a", "Dune")).toBe(false);
	// Case is a real difference — the two rows still read apart
	expect(isTitleTaken(docs, "b", "dune")).toBe(false);
});
