import { beforeEach, expect, test, vi } from "vitest";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { ChapterMeta, Doc, ProjectMeta } from "../../types";

const setChapterTags = vi.hoisted(() => vi.fn());
const setChapterSynopsis = vi.hoisted(() => vi.fn());
const setTagColor = vi.hoisted(() => vi.fn());
// services/chapters.ts pulls from the same module id, so the factory has to
// cover every named export reachable from the inspector, not just the ones
// under test.
vi.mock("../../services/invoke", () => ({
	setChapterTags,
	setChapterSynopsis,
	setTagColor,
	renameChapter: vi.fn(),
	readChapter: vi.fn(),
}));

const { createInspector } = await import("./inspector");

initI18n("en");

const doc = (id: string, tags: string[], synopsis = ""): Doc =>
	({ id, title: id, tags, synopsis, content: "" }) as Doc;

const meta = (id: string, tags: string[], synopsis = ""): ChapterMeta =>
	({
		id,
		title: id,
		tags,
		synopsis,
		word_count: 0,
		modified: NOW,
	}) as ChapterMeta;

const NOW = "2026-01-01T00:00:00Z";

// In the document, not just built: the synopsis field guards against an
// autosave overwriting it by comparing `document.activeElement`, and a detached
// element can never become that.
const container = document.createElement("div");
document.body.appendChild(container);
createInspector(container);

const tagList = () =>
	container.querySelector("[class*='tagList']") as HTMLElement;
const chips = () => [...tagList().querySelectorAll("[class*='tagName']")];
const input = () =>
	container.querySelector("[class*='tagInput']") as HTMLInputElement;
const options = () => [
	...container.querySelectorAll<HTMLOptionElement>("datalist option"),
];

function key(k: string) {
	input().dispatchEvent(
		new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
	);
}

const synopsisField = () =>
	container.querySelector("[class*='synopsisInput']") as HTMLTextAreaElement;

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	setChapterTags.mockReset();
	setChapterSynopsis.mockReset();
	setTagColor.mockReset();
	setChapterTags.mockResolvedValue(meta("ch-1", []));
	setChapterSynopsis.mockResolvedValue(meta("ch-1", ["harbour"]));
	setTagColor.mockResolvedValue(undefined);
	store.set("projectPath", "/tmp/novel");
	store.set("projectMeta", { tag_colors: {} } as ProjectMeta);
	store.set("saveState", "saved");
	store.set("saveError", null);
	store.set("documents", [doc("ch-1", ["harbour"])]);
	store.set("activeDoc", doc("ch-1", ["harbour"]));
	input().value = "";
	synopsisField().blur();
});

test("renders one chip per tag on the active chapter", () => {
	store.set("activeDoc", doc("ch-1", ["harbour", "pov-paul"]));
	expect(chips().map((c) => c.textContent)).toEqual(["harbour", "pov-paul"]);
});

test("Enter adds the typed tag and clears the field", () => {
	input().value = "  subplot-bg  ";
	key("Enter");

	expect(setChapterTags).toHaveBeenCalledWith("/tmp/novel", "ch-1", [
		"harbour",
		"subplot-bg",
	]);
	expect(input().value).toBe("");
});

// The comma is the separator, so it must never end up inside a tag name.
test("a comma commits the tag", () => {
	input().value = "ledger";
	key(",");
	expect(setChapterTags).toHaveBeenCalledWith("/tmp/novel", "ch-1", [
		"harbour",
		"ledger",
	]);
});

test("a tag already on the chapter is not added twice, whatever its case", () => {
	input().value = "HARBOUR";
	key("Enter");
	expect(setChapterTags).not.toHaveBeenCalled();
});

test("Backspace on an empty field removes the last tag", () => {
	store.set("activeDoc", doc("ch-1", ["harbour", "pov-paul"]));
	key("Backspace");
	expect(setChapterTags).toHaveBeenCalledWith("/tmp/novel", "ch-1", [
		"harbour",
	]);
});

// With text in the field Backspace is ordinary editing, not a delete.
test("Backspace with text in the field removes nothing", () => {
	input().value = "sub";
	key("Backspace");
	expect(setChapterTags).not.toHaveBeenCalled();
});

test("the × writes the remaining tags", () => {
	store.set("activeDoc", doc("ch-1", ["harbour", "pov-paul"]));
	const remove = tagList().querySelectorAll<HTMLButtonElement>(
		"[class*='tagRemove']",
	);
	remove[0].click();
	expect(setChapterTags).toHaveBeenCalledWith("/tmp/novel", "ch-1", [
		"pov-paul",
	]);
});

test("the swatch writes the chosen color and paints the dot", async () => {
	const swatch = tagList().querySelector(
		"[class*='tagSwatch']",
	) as HTMLSelectElement;
	swatch.value = "water";
	swatch.dispatchEvent(new Event("change"));

	expect(setTagColor).toHaveBeenCalledWith("/tmp/novel", "harbour", "water");
	await vi.waitFor(() =>
		expect(store.get("projectMeta")?.tag_colors).toEqual({
			harbour: "water",
		}),
	);
});

test("the default option clears the stored color", () => {
	store.set("projectMeta", {
		tag_colors: { harbour: "water" },
	} as unknown as ProjectMeta);
	const swatch = tagList().querySelector(
		"[class*='tagSwatch']",
	) as HTMLSelectElement;
	expect(swatch.value).toBe("water");

	swatch.value = "";
	swatch.dispatchEvent(new Event("change"));
	expect(setTagColor).toHaveBeenCalledWith("/tmp/novel", "harbour", "");
});

test("the suggestions offer other chapters' tags but not this one's", () => {
	store.set("documents", [
		doc("ch-1", ["harbour"]),
		doc("ch-2", ["pov-paul", "harbour"]),
	]);
	expect(options().map((o) => o.value)).toEqual(["pov-paul"]);
});

// The chip is built with createElement, so a tag holding markup is text.
test("a tag name with markup renders as text, never as live DOM", () => {
	store.set("activeDoc", doc("ch-1", ["<img src=x onerror=1>"]));
	expect(tagList().querySelector("img")).toBeNull();
	expect(chips()[0].textContent).toBe("<img src=x onerror=1>");
});

test("blurring the synopsis writes it and folds the result back", async () => {
	const written = "Paul wakes.\n\nJessica waits.";
	setChapterSynopsis.mockResolvedValue(meta("ch-1", ["harbour"], written));

	synopsisField().value = written;
	synopsisField().dispatchEvent(new Event("change"));
	await tick();

	// Verbatim: the paragraph break is the point, and the backend writes it as
	// a block scalar
	expect(setChapterSynopsis).toHaveBeenCalledWith(
		"/tmp/novel",
		"ch-1",
		written,
	);
	expect(store.get("activeDoc")?.synopsis).toBe(written);
	expect(store.get("documents")[0].synopsis).toBe(written);
});

test("an unchanged synopsis writes nothing", () => {
	store.set("activeDoc", doc("ch-1", ["harbour"], "Paul wakes."));
	synopsisField().value = "Paul wakes.";
	synopsisField().dispatchEvent(new Event("change"));

	expect(setChapterSynopsis).not.toHaveBeenCalled();
});

test("a refused synopsis reaches the save indicator", async () => {
	// What a broken frontmatter block comes back as
	setChapterSynopsis.mockRejectedValue("This chapter's frontmatter is broken");
	vi.spyOn(console, "error").mockImplementation(() => {});

	synopsisField().value = "He wakes.";
	synopsisField().dispatchEvent(new Event("change"));
	await tick();

	expect(store.get("saveState")).toBe("error");
	expect(store.get("saveError")).toContain("frontmatter is broken");
	// The store keeps what is on disk, not what was refused
	expect(store.get("activeDoc")?.synopsis).toBe("");
});

test("the synopsis field loads the open chapter's text", () => {
	store.set("activeDoc", doc("ch-1", [], "Already written."));
	expect(synopsisField().value).toBe("Already written.");

	store.set("activeDoc", null);
	expect(synopsisField().value).toBe("");
});

test("an autosave does not overwrite a synopsis being typed", () => {
	synopsisField().focus();
	synopsisField().value = "Half a thou";

	// An autosave writes activeDoc while the writer is still in the field
	store.set("activeDoc", doc("ch-1", [], ""));

	expect(synopsisField().value).toBe("Half a thou");
});
