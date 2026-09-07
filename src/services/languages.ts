import type { Locales } from "../i18n/i18n-types";
import { locales } from "../i18n/i18n-util";

/**
 * Endonyms, not translations. "Español" is Español in an English UI too, which
 * is how every OS language picker labels them, and it keeps two more strings
 * out of both locale files. A locale added to `i18n-util` fails `tsc` here.
 */
const LANGUAGE_NAMES: Record<Locales, string> = {
	en: "English",
	es: "Español",
};

/**
 * A picker over the languages a manuscript can be written in.
 *
 * ponytail: a native `<select>`. The keyboard, the screen reader and the
 * platform's own menu come free — see style-dropdown.ts for what building one
 * costs when the design actually needs it.
 */
export function createLanguageSelect(value: string): HTMLSelectElement {
	const select = document.createElement("select");

	// A tag we do not know — a project written by hand, or by a later version —
	// gets an option of its own, so the control never renders blank.
	const tags: string[] = locales.includes(value as Locales)
		? [...locales]
		: [...locales, value];

	for (const tag of tags) {
		const option = document.createElement("option");
		option.value = tag;
		option.textContent = LANGUAGE_NAMES[tag as Locales] ?? tag;
		select.appendChild(option);
	}
	select.value = value;

	return select;
}
