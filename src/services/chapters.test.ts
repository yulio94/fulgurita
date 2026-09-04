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

// Every style in the catalog, in one chapter. Two consecutive verses to pin that
// each paragraph carries its own marker, and a hard break inside one because a
// verse that silently reflows is a broken verse.
const STYLED_CHAPTER = `## The Water of Life

<!-- sietch:verse -->
He who controls the spice  
controls the *universe*.

<!-- sietch:verse -->
And he who destroys a thing  
controls it utterly.

<!-- sietch:attribution -->
— Muad'Dib

<!-- sietch:caption -->
Photograph taken in Arrakeen, 10191 AG.

<!-- sietch:centered -->
END OF PART ONE

Plain closing paragraph.
`;

// Stricter than the unstyled round trip below, which only asks for idempotence.
// The markers are ours, so there is no turndown quirk to concede to: what the
// writer's file says has to be what comes back out of it.
test("a styled chapter round-trips byte for byte", () => {
	const once = htmlToMarkdown(markdownToHtml(STYLED_CHAPTER));
	const twice = htmlToMarkdown(markdownToHtml(once));

	// turndown emits no trailing newline, and save_chapter writes what it is given
	expect(once).toBe(STYLED_CHAPTER.trimEnd());
	expect(twice).toBe(once);
});

test("a marker puts its style on the paragraph below it", () => {
	const html = markdownToHtml(STYLED_CHAPTER);

	expect(html).toContain('<p data-style="verse">');
	expect(html).toContain('<p data-style="attribution">');
	expect(html).toContain('<p data-style="caption">');
	expect(html).toContain('<p data-style="centered">');
	// The comment is consumed, not passed through — ProseMirror would drop it
	expect(html).not.toContain("<!--");
	// A hard break has to reach the editor as one
	expect(html).toContain("spice<br>controls");
});

// The text is the manuscript. A marker we do not recognise is worth losing;
// the paragraph under it never is.
test("an unknown marker loads the paragraph unstyled and keeps its text", () => {
	const html = markdownToHtml("<!-- sietch:chorus -->\nSand and silence.\n");

	expect(html).toContain("Sand and silence.");
	expect(html).not.toContain("data-style");
});

test("a marker above something that is not a paragraph is ignored", () => {
	const html = markdownToHtml("<!-- sietch:verse -->\n# Chapter One\n");

	expect(html).toContain("Chapter One");
	expect(html).not.toContain("data-style");
});

// Comments we did not write belong to the writer, or to another tool.
test("a comment outside the sietch namespace is left alone", () => {
	const html = markdownToHtml(
		"<!-- TODO: rewrite this -->\nThe spice must flow.\n",
	);

	expect(html).toContain("<!-- TODO: rewrite this -->");
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
