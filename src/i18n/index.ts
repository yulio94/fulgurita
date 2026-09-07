import type { Locales, TranslationFunctions } from "./i18n-types.js";
import { baseLocale, i18nObject, isLocale } from "./i18n-util.js";
import { loadLocale } from "./i18n-util.sync.js";

let LL: TranslationFunctions | null = null;
let current: Locales | null = null;

/**
 * Resolve a BCP-47 tag (e.g. "es-MX", "en-US") to a supported Locales value.
 * Falls back to the base locale if no match is found.
 */
export function resolveLocale(bcp47: string): Locales {
	const tag = bcp47.toLowerCase();

	// Try exact match first (e.g. "en", "es")
	if (isLocale(tag)) return tag;

	// Try language prefix (e.g. "es-MX" → "es")
	const prefix = tag.split("-")[0];
	if (isLocale(prefix)) return prefix;

	return baseLocale;
}

/**
 * Initialize the i18n system. Must be called once before any getLL() call.
 */
export function initI18n(locale: Locales): void {
	loadLocale(locale);
	LL = i18nObject(locale);
	current = locale;
}

/**
 * The locale the mounted UI was built with — not the persisted one, which can
 * already be a language the app has not restarted into yet. Settings compares
 * the two to tell whether a restart is owed.
 */
export function getLocale(): Locales {
	if (!current) {
		throw new Error(
			"i18n not initialized — call initI18n() before getLocale()",
		);
	}
	return current;
}

/**
 * Get the current translation functions. Throws if called before initI18n().
 */
export function getLL(): TranslationFunctions {
	if (!LL) {
		throw new Error("i18n not initialized — call initI18n() before getLL()");
	}
	return LL;
}
