import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { expect, test, vi } from "vitest";
import { initI18n } from "../../i18n";
import type { ResearchItem } from "../../types";
import { createFormatToolbar } from "./format-toolbar";

const HARBOUR: ResearchItem = {
	type: "item",
	id: "research/Lugares/harbour.png",
	kind: "file",
	title: "harbour.png",
	url: "",
};

// The picker is a real overlay; here the writer picks straight away
vi.mock("../command-palette/command-palette", () => ({
	pickResearch: (onPick: (item: ResearchItem) => void) => onPick(HARBOUR),
}));
vi.mock("../../services/research", async (actual) => ({
	...(await actual<typeof import("../../services/research")>()),
	loadResearch: vi.fn(() => Promise.resolve()),
}));

// The active state is the part that can silently rot: onUpdate does not fire on
// selection change, so the toolbar listens to transactions instead.
test("a button reflects the mark under the cursor", () => {
	initI18n("en");
	const container = document.createElement("div");
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [StarterKit],
		content: "<p>The Crossing</p>",
	});
	createFormatToolbar(container, editor);

	const bold = container.querySelector<HTMLButtonElement>(
		'[aria-label="Bold"]',
	);
	if (!bold) throw new Error("bold button missing");
	expect(bold.getAttribute("aria-pressed")).toBe("false");

	editor.commands.selectAll();
	bold.click();
	expect(editor.isActive("bold")).toBe(true);
	expect(bold.getAttribute("aria-pressed")).toBe("true");

	bold.click();
	expect(bold.getAttribute("aria-pressed")).toBe("false");

	editor.destroy();
});

// F-028 leaves Bold and Italic to StarterKit's keymap instead of binding them in
// hotkeys-js, so nothing in our own code proves the keyboard path still works.
// This pins it, and that the toolbar follows a toggle it did not initiate.
test("Mod+B toggles bold from the keyboard, and the toolbar follows", () => {
	initI18n("en");
	const container = document.createElement("div");
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [StarterKit],
		content: "<p>The Crossing</p>",
	});
	createFormatToolbar(container, editor);

	const bold = container.querySelector<HTMLButtonElement>(
		'[aria-label="Bold"]',
	);
	if (!bold) throw new Error("bold button missing");

	editor.commands.selectAll();
	// ProseMirror resolves Mod off navigator.platform, which happy-dom reports as
	// "X11; Darwin arm64" — not a Mac, so Mod is Ctrl here and Cmd on the desktop.
	const press = () =>
		editor.view.dom.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "b",
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);

	press();
	expect(editor.isActive("bold")).toBe(true);
	expect(bold.getAttribute("aria-pressed")).toBe("true");

	// One press, one toggle. A hotkeys-js binding would land a second time here.
	press();
	expect(editor.isActive("bold")).toBe(false);
	expect(bold.getAttribute("aria-pressed")).toBe("false");

	editor.destroy();
});

test("Link to research turns the selection into a relative link to the file", async () => {
	initI18n("en");
	const container = document.createElement("div");
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [StarterKit.configure({ link: { openOnClick: false } })],
		content: "<p>The charts were wrong</p>",
	});
	createFormatToolbar(container, editor);
	const button = container.querySelector<HTMLButtonElement>(
		'[aria-label="Link to research"]',
	);
	if (!button) throw new Error("link to research button missing");

	// "charts" — positions count from the paragraph's opening token
	editor.commands.setTextSelection({ from: 5, to: 11 });
	button.click();
	await vi.waitFor(() => expect(editor.isActive("link")).toBe(true));

	expect(editor.getHTML()).toContain('href="../research/Lugares/harbour.png"');
	expect(editor.getHTML()).toContain(">charts</a>");
	expect(button.getAttribute("aria-pressed")).toBe("true");

	editor.destroy();
});
