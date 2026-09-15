import { expect, test } from "vitest";
import type { ResearchItem } from "../types";
import { researchHref, researchIdFromHref, toResearchDoc } from "./research";

// marked encodes an href on load and turndown writes back what it found, so a
// link may be stored either way. Both have to lead to the same file.
test("a research href leads back to its id, encoded or not", () => {
	const id = "research/Lugares del año/puerto.png";
	const href = researchHref(id);

	expect(href).toBe("../research/Lugares%20del%20a%C3%B1o/puerto.png");
	expect(researchIdFromHref(href)).toBe(id);
	expect(researchIdFromHref(`../${id}`)).toBe(id);
});

test("anything that is not research is not a research link", () => {
	expect(researchIdFromHref("https://atlas.test/research/maps")).toBeNull();
	expect(researchIdFromHref("../chapters/one.md")).toBeNull();
	// A malformed escape is a broken link, not a crash
	expect(researchIdFromHref("../research/%E0%A4%A")).toBeNull();
});

test("a row names its file only when the title does not already", () => {
	const link = (id: string): ResearchItem => ({
		type: "item",
		id,
		kind: "link",
		title: "Atlas",
		url: "https://atlas.test/maps",
	});

	expect(toResearchDoc(link("research/Links/Atlas.md")).meta).toBe("");
	expect(toResearchDoc(link("research/Links/Atlas 2.md")).meta).toBe(
		"Atlas 2.md",
	);
	expect(toResearchDoc(link("research/Links/Atlas 2.md")).preview).toBe(
		"atlas.test",
	);
});
