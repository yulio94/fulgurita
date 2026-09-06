import { expect, test, vi } from "vitest";
import { bus } from "../core/bus";
import { isMac } from "./platform";
import { initShortcuts } from "./shortcuts";

initShortcuts();

/**
 * hotkeys-js reads `keyCode`, which the KeyboardEvent constructor drops, and it
 * tracks held keys until their keyup — so a press that never lifts poisons the
 * next one.
 */
function press(key: string, keyCode: number, shift = false) {
	for (const type of ["keydown", "keyup"]) {
		const event = new KeyboardEvent(type, {
			key,
			shiftKey: shift,
			metaKey: isMac,
			ctrlKey: !isMac,
		});
		Object.defineProperty(event, "keyCode", { value: keyCode });
		document.dispatchEvent(event);
	}
}

test("the primary modifier drives every app shortcut", () => {
	const heard: string[] = [];
	const offs = [
		bus.on("palette:open", () => heard.push("palette:open")),
		bus.on("palette:open-docs", () => heard.push("palette:open-docs")),
		bus.on("document:save", () => heard.push("document:save")),
		bus.on("document:new", () => heard.push("document:new")),
		bus.on("focus:toggle", () => heard.push("focus:toggle")),
	];

	press("k", 75);
	press("p", 80);
	press("s", 83);
	press("n", 78);
	press("f", 70, true);

	for (const off of offs) off();

	expect(heard).toEqual([
		"palette:open",
		"palette:open-docs",
		"document:save",
		"document:new",
		"focus:toggle",
	]);
});

// StarterKit binds Mod-b and Mod-i in ProseMirror's keymap, and `hotkeys.filter`
// lets every binding through the contentEditable. A binding here would toggle the
// mark twice per press.
test("bold and italic are left to TipTap", () => {
	const seen = vi.fn();
	const off = bus.on("document:save", seen);

	press("b", 66);
	press("i", 73);
	off();

	expect(seen).not.toHaveBeenCalled();
});
