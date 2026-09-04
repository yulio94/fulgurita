import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { expect, test } from "vitest";
import { initI18n } from "../../i18n";
import { ParagraphStyle } from "./paragraph-style";
import { createStyleDropdown } from "./style-dropdown";

function mount(content = "<p>Muad'Dib</p>") {
	initI18n("en");
	const container = document.createElement("div");
	document.body.appendChild(container);
	const editor = new Editor({
		element: document.createElement("div"),
		extensions: [StarterKit, ParagraphStyle],
		content,
	});
	createStyleDropdown(container, editor);

	const trigger = container.querySelector<HTMLButtonElement>(
		'[aria-label="Paragraph style"]',
	);
	const menu = container.querySelector<HTMLElement>('[role="menu"]');
	if (!trigger || !menu) throw new Error("dropdown did not render");

	const item = (label: string) => {
		const found = [
			...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
		].find((el) => el.textContent?.trim() === label);
		if (!found) throw new Error(`no item labelled ${label}`);
		return found;
	};

	return { container, editor, trigger, menu, item };
}

test("picking a style tags the paragraph and checks the item", () => {
	const { editor, trigger, item } = mount();

	expect(trigger.textContent).toContain("No Style");

	item("Verse").click();

	expect(editor.isActive("paragraph", { styleName: "verse" })).toBe(true);
	expect(editor.getHTML()).toContain('data-style="verse"');
	expect(item("Verse").getAttribute("aria-checked")).toBe("true");
	expect(item("No Style").getAttribute("aria-checked")).toBe("false");
	expect(trigger.textContent).toContain("Verse");

	editor.destroy();
});

// Selecting Verse with the cursor in a heading has to convert the block. Without
// the setParagraph in the command it would silently do nothing.
test("a style applied over a heading converts it to a paragraph", () => {
	const { editor, item } = mount("<h2>The Water of Life</h2>");

	item("Caption").click();

	expect(editor.isActive("heading")).toBe(false);
	expect(editor.getHTML()).toContain('data-style="caption"');

	item("No Style").click();
	expect(editor.getHTML()).toContain("<p>The Water of Life</p>");

	editor.destroy();
});

// A blockquote holds a paragraph, so a first-hit-wins scan over the catalog
// would label every blockquote "No Style".
test("the trigger names the block, not the paragraph inside it", () => {
	const { trigger, editor } = mount(
		"<blockquote><p>Fear is the mind-killer.</p></blockquote>",
	);

	expect(trigger.textContent).toContain("Block Quote");

	editor.destroy();
});

test("the labels are offset from the heading levels they set", () => {
	const { editor, item } = mount();

	item("Title").click();
	expect(editor.isActive("heading", { level: 1 })).toBe(true);

	item("Heading 1").click();
	expect(editor.isActive("heading", { level: 2 })).toBe(true);

	item("Heading 3").click();
	expect(editor.isActive("heading", { level: 4 })).toBe(true);

	editor.destroy();
});

test("arrow keys move through the menu and Escape closes it", () => {
	const { trigger, menu, editor, item } = mount();

	expect(menu.hidden).toBe(true);
	trigger.click();
	expect(menu.hidden).toBe(false);
	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	// Opens on the active style, so Enter alone changes nothing
	expect(document.activeElement).toBe(item("No Style"));

	const key = (k: string) =>
		menu.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

	key("ArrowDown");
	expect(document.activeElement).toBe(item("Title"));
	key("ArrowUp");
	expect(document.activeElement).toBe(item("No Style"));
	// Wraps around rather than dead-ending
	key("ArrowUp");
	expect(document.activeElement).toBe(item("Centered Text"));
	key("Home");
	expect(document.activeElement).toBe(item("No Style"));

	key("Escape");
	expect(menu.hidden).toBe(true);
	expect(trigger.getAttribute("aria-expanded")).toBe("false");

	editor.destroy();
});

test("a click outside closes the menu", () => {
	const { trigger, menu, editor } = mount();

	trigger.click();
	expect(menu.hidden).toBe(false);

	document.body.dispatchEvent(
		new PointerEvent("pointerdown", { bubbles: true }),
	);
	expect(menu.hidden).toBe(true);

	editor.destroy();
});
