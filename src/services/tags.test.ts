import { expect, test } from "vitest";
import type { Doc } from "../types";
import { suggestTags, tagColorVar } from "./tags";

// suggestTags only reads tags; cast the rest away.
const doc = (tags: string[]): Doc => ({ tags }) as Doc;

test("the suggestions are every tag in the project except the ones already here", () => {
	const docs = [doc(["pov-paul", "harbour"]), doc(["subplot-bg", "pov-paul"])];
	expect(suggestTags(docs, ["harbour"])).toEqual(["pov-paul", "subplot-bg"]);
});

// The datalist is what steers a writer to the spelling already in the project,
// so a tag they have under another case must not be offered back to them.
test("a tag already on the chapter is excluded whatever its case", () => {
	expect(suggestTags([doc(["POV"])], ["pov"])).toEqual([]);
});

test("one spelling survives a tag used by several chapters", () => {
	const docs = [doc(["harbour"]), doc(["Harbour"])];
	expect(suggestTags(docs, [])).toHaveLength(1);
});

test("a known color resolves to its token", () => {
	expect(tagColorVar("water")).toBe("var(--tag-water)");
});

// A hand-edited sietch.json is the reason this is a lookup and not a template:
// a name outside the palette paints nothing rather than reaching a stylesheet.
test("a color name we do not know paints nothing", () => {
	expect(tagColorVar("chartreuse")).toBe("");
	expect(tagColorVar(undefined)).toBe("");
});
