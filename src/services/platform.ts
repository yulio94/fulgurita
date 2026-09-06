import { platform } from "@tauri-apps/plugin-os";

/**
 * `platform()` reads a global Tauri injects at startup — no IPC, so no
 * capability entry — and the OS cannot change while the app runs. Resolving it
 * once at import keeps every caller synchronous.
 */
export const isMac = (() => {
	try {
		return platform() === "macos";
	} catch {
		// Not running in Tauri (browser-only dev, tests) — fall back
		return navigator.userAgent.includes("Mac");
	}
})();

/**
 * A hotkeys-js binding for the platform's primary modifier.
 *
 * Registering `command+k, ctrl+k` together would look simpler, but on macOS it
 * hands Ctrl+K and Ctrl+N to the app — those are Cocoa text-navigation keys in
 * any focused field.
 */
export const mod = (key: string) => (isMac ? `command+${key}` : `ctrl+${key}`);

// `Mod` is what ProseMirror calls the same key, so shortcut specs read the same
// way in the palette as they do in the editor's own keymaps.
const KEY_LABELS: Record<string, string> = isMac
	? { Mod: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃" }
	: { Mod: "Ctrl", Shift: "Shift", Alt: "Alt", Ctrl: "Ctrl" };

/** Splits a spec like `Mod+Shift+I` into the keys to render. */
export function formatShortcut(spec: string): string[] {
	return spec.split("+").map((key) => KEY_LABELS[key] ?? key);
}
