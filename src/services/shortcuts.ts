import hotkeys from "hotkeys-js";
import { bus } from "../core/bus";

export function initShortcuts() {
	// Allow hotkeys inside input/textarea/contentEditable
	hotkeys.filter = () => true;

	hotkeys("command+k, ctrl+k", (e) => {
		e.preventDefault();
		bus.emit("palette:open");
	});

	hotkeys("command+\\, ctrl+\\", (e) => {
		e.preventDefault();
		bus.emit("panel:toggle-sidebar");
	});

	hotkeys("command+shift+i, ctrl+shift+i", (e) => {
		e.preventDefault();
		bus.emit("panel:toggle-inspector");
	});

	hotkeys("command+shift+f, ctrl+shift+f", (e) => {
		e.preventDefault();
		bus.emit("focus:toggle");
	});

	hotkeys("command+s, ctrl+s", (e) => {
		e.preventDefault();
		bus.emit("document:save");
	});

	hotkeys("command+n, ctrl+n", (e) => {
		e.preventDefault();
		bus.emit("document:new");
	});
}
