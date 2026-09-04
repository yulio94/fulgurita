import { expect, test } from "vitest";
import { htmlToMarkdown, markdownToHtml } from "./chapters";

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
