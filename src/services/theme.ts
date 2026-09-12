import { bus } from "../core/bus";
import { store } from "../core/store";
import type { ThemePref } from "../types";

/**
 * What the writer picked against what the OS is doing. Pure, and the only place
 * that has to think about three values — everything downstream reads
 * `resolvedTheme` and stays a two-case read.
 */
export function resolveTheme(
	pref: ThemePref,
	prefersDark: boolean,
): "light" | "dark" {
	if (pref === "system") return prefersDark ? "dark" : "light";
	return pref;
}

/**
 * Owns the `.dark` class, the system query and the theme:toggle handler.
 * Deliberately not part of the titlebar: that only mounts with a project open,
 * and the start screen needs a theme too.
 */
export function initTheme() {
	const query = window.matchMedia("(prefers-color-scheme: dark)");

	const apply = () => {
		const pref = store.get("theme");
		store.set("resolvedTheme", resolveTheme(pref, query.matches));
		void syncWindowTheme(pref);
	};

	// Clicking lands on an explicit value, always the opposite of what is on
	// screen. So a click from "system" leaves "system", and Settings is the way
	// back to it.
	bus.on("theme:toggle", () => {
		store.set(
			"theme",
			store.get("resolvedTheme") === "dark" ? "light" : "dark",
		);
	});

	store.on("theme", apply, { immediate: true });
	query.addEventListener("change", apply);

	store.on(
		"resolvedTheme",
		(theme) => {
			document.documentElement.classList.toggle("dark", theme === "dark");
		},
		{ immediate: true },
	);
}

/**
 * Put the native window chrome on the same side as the CSS.
 *
 * The theme toggle is ours and the system appearance is the OS's, and macOS
 * draws the window title in the second one — so a dark app under a light system
 * left the title near-black on our dark panel. Windows draws its titlebar the
 * same way. Telling the window its theme is what macOS needs to flip the title
 * text, and it costs nothing on Linux, where the chrome is the WM's anyway.
 *
 * Takes the preference rather than the resolved theme: `null` hands the chrome
 * back to the OS, which is what "system" means.
 */
async function syncWindowTheme(pref: ThemePref) {
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().setTheme(pref === "system" ? null : pref);
	} catch {
		// Not running in Tauri (browser-only dev, tests) — no window to tell
	}
}
