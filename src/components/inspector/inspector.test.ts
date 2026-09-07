import { beforeEach, expect, test, vi } from "vitest";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { ChapterMeta, Doc, ProjectMeta } from "../../types";

const setChapterTags = vi.hoisted(() => vi.fn());
const setTagColor = vi.hoisted(() => vi.fn());
// services/chapters.ts pulls from the same module id, so the factory has to
// cover every named export reachable from the inspector, not just the two
// under test.
vi.mock("../../services/invoke", () => ({
	setChapterTags,
	setTagColor,
	renameChapter: vi.fn(),
	readChapter: vi.fn(),
}));

const { createInspector } = await import("./inspector");

initI18n("en");

const doc = (id: string, tags: string[]): Doc =>
	({ id, title: id, tags, content: "" }) as Doc;

const meta = (id: string, tags: string[]): ChapterMeta =>
	({ id, title: id, tags, word_count: 0, modified: NOW }) as ChapterMeta;

const NOW = "2026-01-01T00:00:00Z";

const container = document.createElement("div");
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

beforeEach(() => {
	setChapterTags.mockReset();
	setTagColor.mockReset();
	setChapterTags.mockResolvedValue(meta("ch-1", []));
	setTagColor.mockResolvedValue(undefined);
	store.set("projectPath", "/tmp/novel");
	store.set("projectMeta", { tag_colors: {} } as ProjectMeta);
	store.set("documents", [doc("ch-1", ["arrakeen"])]);
	store.set("activeDoc", doc("ch-1", ["arrakeen"]));
	input().value = "";
});

test("renders one chip per tag on the active chapter", () => {
	store.set("activeDoc", doc("ch-1", ["arrakeen", "pov-paul"]));
	expect(chips().map((c) => c.textContent)).toEqual(["arrakeen", "pov-paul"]);
});

test("Enter adds the typed tag and clears the field", () => {
	input().value = "  subplot-bg  ";
	key("Enter");

	expect(setChapterTags).toHaveBeenCalledWith("/tmp/novel", "ch-1", [
		"arrakeen",
		"subplot-bg",
	]);
	expect(input().value).toBe("");
});

// The comma is the separator, so it must never end up inside a tag name.
test("a comma commits the tag", () => {
	input().value = "spice";
	key(",");
	expect(setChapterTags).toHaveBeenCalledWith("/tmp/novel", "ch-1", [
		"arrakeen",
		"spice",
	]);
});

test("a tag already on the chapter is not added twice, whatever its case", () => {
	input().value = "ARRAKEEN";
	key("Enter");
	expect(setChapterTags).not.toHaveBeenCalled();
});

test("Backspace on an empty field removes the last tag", () => {
	store.set("activeDoc", doc("ch-1", ["arrakeen", "pov-paul"]));
	key("Backspace");
	expect(setChapterTags).toHaveBeenCalledWith("/tmp/novel", "ch-1", [
		"arrakeen",
	]);
});

// With text in the field Backspace is ordinary editing, not a delete.
test("Backspace with text in the field removes nothing", () => {
	input().value = "sub";
	key("Backspace");
	expect(setChapterTags).not.toHaveBeenCalled();
});

test("the × writes the remaining tags", () => {
	store.set("activeDoc", doc("ch-1", ["arrakeen", "pov-paul"]));
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

	expect(setTagColor).toHaveBeenCalledWith("/tmp/novel", "arrakeen", "water");
	await vi.waitFor(() =>
		expect(store.get("projectMeta")?.tag_colors).toEqual({
			arrakeen: "water",
		}),
	);
});

test("the default option clears the stored color", () => {
	store.set("projectMeta", {
		tag_colors: { arrakeen: "water" },
	} as unknown as ProjectMeta);
	const swatch = tagList().querySelector(
		"[class*='tagSwatch']",
	) as HTMLSelectElement;
	expect(swatch.value).toBe("water");

	swatch.value = "";
	swatch.dispatchEvent(new Event("change"));
	expect(setTagColor).toHaveBeenCalledWith("/tmp/novel", "arrakeen", "");
});

test("the suggestions offer other chapters' tags but not this one's", () => {
	store.set("documents", [
		doc("ch-1", ["arrakeen"]),
		doc("ch-2", ["pov-paul", "arrakeen"]),
	]);
	expect(options().map((o) => o.value)).toEqual(["pov-paul"]);
});

// The chip is built with createElement, so a tag holding markup is text.
test("a tag name with markup renders as text, never as live DOM", () => {
	store.set("activeDoc", doc("ch-1", ["<img src=x onerror=1>"]));
	expect(tagList().querySelector("img")).toBeNull();
	expect(chips()[0].textContent).toBe("<img src=x onerror=1>");
});
