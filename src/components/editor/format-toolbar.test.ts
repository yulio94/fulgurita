import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { expect, test } from "vitest";
import { initI18n } from "../../i18n";
import { createFormatToolbar } from "./format-toolbar";

// The active state is the part that can silently rot: onUpdate does not fire on
// selection change, so the toolbar listens to transactions instead.
test("a button reflects the mark under the cursor", () => {
	initI18n("en");
	const container = document.createElement("div");
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [StarterKit],
		content: "<p>Muad'Dib</p>",
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
