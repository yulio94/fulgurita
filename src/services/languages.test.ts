import { expect, test } from "vitest";
import { createLanguageSelect } from "./languages";

test("a language we do not know still shows, rather than rendering blank", () => {
	// A project written by hand, or by a version that supports more than we do
	const select = createLanguageSelect("fr");

	expect([...select.options].map((o) => o.value)).toEqual(["en", "es", "fr"]);
	expect(select.value).toBe("fr");
});

test("a known tag is labelled by its endonym and selected", () => {
	const select = createLanguageSelect("es");

	expect(select.options.length).toBe(2);
	expect(select.value).toBe("es");
	expect(select.selectedOptions[0].textContent).toBe("Español");
});
