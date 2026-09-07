import { expect, test } from "vitest";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { Doc, EditorStats } from "../../types";
import { createStatusbar, projectWords } from "./statusbar";

// projectWords only reads id/words; cast the rest away.
const doc = (id: string, words: number): Doc => ({ id, words }) as Doc;

test("sums the stored counts when no chapter is open", () => {
	const docs = [doc("a", 1200), doc("b", 800), doc("c", 40)];
	expect(projectWords(docs, undefined, 999)).toBe(2040);
});

// The open chapter's stored count is one autosave behind, so the live figure
// from the editor replaces it — otherwise the total would stall while typing.
test("the live count stands in for the open chapter", () => {
	const docs = [doc("a", 1200), doc("b", 800)];
	expect(projectWords(docs, "b", 850)).toBe(2050);
});

// A stale id must not silently drop a chapter from the manuscript.
test("an unknown active id leaves every stored count in place", () => {
	const docs = [doc("a", 1200), doc("b", 800)];
	expect(projectWords(docs, "gone", 999)).toBe(2000);
});

test("an empty project counts zero", () => {
	expect(projectWords([], "a", 500)).toBe(0);
});

// The session baseline is captured by timing, not by an explicit event, so the
// order main.ts loads a project in is what these two pin down.
function mount(): HTMLElement {
	initI18n("en");
	// Mount against an empty project: a leftover document list would be read as
	// the baseline before the real one arrives.
	store.set("documents", []);
	store.set("activeDoc", null);
	store.set("dailyGoal", 1000);
	const container = document.createElement("div");
	createStatusbar(container);
	return container;
}

const stats = (words: number): EditorStats => ({
	words,
	characters: 0,
	paragraphs: 0,
	readingTime: "1 min",
});

test("opening a project starts the session at zero, not at the whole manuscript", () => {
	const container = mount();

	// loadChapters sets documents first, then opens the first chapter.
	store.set("documents", [doc("a", 1200), doc("b", 800)]);
	store.set("activeDoc", doc("a", 1200));
	store.set("stats", stats(1200));

	expect(container.textContent).toContain("1,200 / 2,000 words");
	expect(container.textContent).toContain("0 session");
});

test("words typed after the project opened count towards the session and the goal", () => {
	const container = mount();
	store.set("documents", [doc("a", 1200), doc("b", 800)]);
	store.set("activeDoc", doc("a", 1200));
	store.set("stats", stats(1200));

	store.set("stats", stats(1520));

	expect(container.textContent).toContain("1,520 / 2,320 words");
	// 2,320 words: eight pages at 300 a page, ten at 250.
	expect(container.textContent).toContain("~8 pages");
	expect(
		[...container.querySelectorAll("span")].find((el) =>
			el.textContent?.startsWith("~8"),
		)?.title,
	).toBe("Estimate: ~8 pages in 6×9, ~10 in manuscript format.");
	expect(container.textContent).toContain("+320 session");
	expect(container.textContent).toContain("+320 / 1,000");
	expect(
		container.querySelector<HTMLElement>("[class*='progressFill']")?.style
			.width,
	).toBe("32%");
});

// Cutting below where you started is honest in the text and clamped in the bar.
test("a negative session shows its sign but leaves the bar empty", () => {
	const container = mount();
	store.set("documents", [doc("a", 1200)]);
	store.set("activeDoc", doc("a", 1200));
	store.set("stats", stats(1200));

	store.set("stats", stats(1080));

	expect(container.textContent).toContain("-120 session");
	expect(
		container.querySelector<HTMLElement>("[class*='progressFill']")?.style
			.width,
	).toBe("0%");
});

// A refused write names a file the writer has to go repair by hand. The label
// only has room for "Error", so the reason hangs off the indicator as a tooltip.
test("a refused write puts its reason on the save indicator", () => {
	const container = mount();
	const indicator = () =>
		[...container.querySelectorAll("span")].find((el) =>
			el.textContent?.startsWith("Error"),
		);

	store.set("saveError", "Frontmatter is broken. Fix it in a text editor.");
	store.set("saveState", "error");
	expect(indicator()?.title).toBe(
		"Frontmatter is broken. Fix it in a text editor.",
	);

	// And it goes when the write lands, so a stale reason cannot outlive it.
	store.set("saveError", null);
	store.set("saveState", "saved");
	const saved = [...container.querySelectorAll("span")].find((el) =>
		el.textContent?.startsWith("Saved"),
	);
	expect(saved?.hasAttribute("title")).toBe(false);
});

// The bar said "~1 pages" on a project barely started, which is where a writer
// is most likely to be reading it.
test("a project under one page counts a page, singular", () => {
	const container = mount();
	store.set("documents", [doc("a", 200)]);
	store.set("stats", stats(200));

	const pages = [...container.querySelectorAll("span")].find((el) =>
		el.textContent?.startsWith("~"),
	);
	expect(pages?.textContent).toBe("~1 page");
});
