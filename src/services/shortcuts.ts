import hotkeys from "hotkeys-js";
import { bus } from "../core/bus";
import { mod } from "./platform";

export function initShortcuts() {
	// Allow hotkeys inside input/textarea/contentEditable
	hotkeys.filter = () => true;

	hotkeys(mod("k"), (e) => {
		e.preventDefault();
		bus.emit("palette:open");
	});

	// Quick-open a chapter by name. Full-text search across the project is
	// F-027 and gets its own key when it lands.
	hotkeys(mod("p"), (e) => {
		// Without this the webview prints the page.
		e.preventDefault();
		bus.emit("palette:open-docs");
	});

	hotkeys(mod("\\"), (e) => {
		e.preventDefault();
		bus.emit("panel:toggle-sidebar");
	});

	hotkeys(mod("shift+i"), (e) => {
		e.preventDefault();
		bus.emit("panel:toggle-inspector");
	});

	hotkeys(mod("shift+f"), (e) => {
		e.preventDefault();
		bus.emit("focus:toggle");
	});

	hotkeys(mod("s"), (e) => {
		e.preventDefault();
		bus.emit("document:save");
	});

	hotkeys(mod("n"), (e) => {
		e.preventDefault();
		bus.emit("document:new");
	});

	// Bold and Italic are deliberately absent: StarterKit binds Mod-b / Mod-i in
	// ProseMirror's keymap. `hotkeys.filter` above lets every binding through the
	// contentEditable, so a second one here would toggle the mark twice per press.
}
