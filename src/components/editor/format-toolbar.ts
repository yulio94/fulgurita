import type { Editor } from "@tiptap/core";
import { getLL } from "../../i18n";
import { type IconName, icon } from "../../services/icons";
import styles from "./format-toolbar.module.css";

interface FormatButton {
	/** Letters stay type, set in the display face; anything pictorial is drawn. */
	glyph: string | { icon: IconName };
	/** Module class shaping the glyph itself, for the ones that are letters. */
	glyphClass?: string;
	label: (LL: ReturnType<typeof getLL>) => string;
	/** Extra space before this button separates one group from the next. */
	startsGroup?: boolean;
	run: (editor: Editor) => void;
	isActive: (editor: Editor) => boolean;
}

const BUTTONS: FormatButton[] = [
	{
		glyph: "B",
		glyphClass: styles.glyphBold,
		label: (LL) => LL.fmtBold(),
		startsGroup: true,
		run: (e) => e.chain().focus().toggleBold().run(),
		isActive: (e) => e.isActive("bold"),
	},
	{
		glyph: "I",
		glyphClass: styles.glyphItalic,
		label: (LL) => LL.fmtItalic(),
		run: (e) => e.chain().focus().toggleItalic().run(),
		isActive: (e) => e.isActive("italic"),
	},
	{
		glyph: "\u201C",
		glyphClass: styles.glyphQuote,
		label: (LL) => LL.fmtBlockquote(),
		run: (e) => e.chain().focus().toggleBlockquote().run(),
		isActive: (e) => e.isActive("blockquote"),
	},
	{
		glyph: { icon: "list" },
		label: (LL) => LL.fmtBulletList(),
		run: (e) => e.chain().focus().toggleBulletList().run(),
		isActive: (e) => e.isActive("bulletList"),
	},
	{
		// ponytail: the inline code mark, it belongs with bold and italic.
		// A code block button when someone writing a novel actually wants one.
		glyph: "</>",
		label: (LL) => LL.fmtCode(),
		run: (e) => e.chain().focus().toggleCode().run(),
		isActive: (e) => e.isActive("code"),
	},
];

/**
 * Formatting row for the editor.
 *
 * ponytail: takes the editor instead of the usual lone container. The Editor
 * instance is local to createEditor and reaching it any other way means routing
 * every command through the bus or the store for no gain.
 */
export function createFormatToolbar(container: HTMLElement, editor: Editor) {
	const LL = getLL();

	const bar = document.createElement("div");
	bar.className = styles.bar;
	bar.setAttribute("role", "toolbar");
	bar.setAttribute("aria-label", LL.formatToolbarLabel());

	const buttons = BUTTONS.map((spec) => {
		const button = document.createElement("button");
		button.type = "button";
		// btn-icon is global (theme.css), so it is not hashed like the module classes.
		button.className = [
			"btn-icon",
			styles.btn,
			spec.glyphClass,
			spec.startsGroup && styles.groupStart,
		]
			.filter(Boolean)
			.join(" ");
		if (typeof spec.glyph === "string") button.textContent = spec.glyph;
		else button.appendChild(icon(spec.glyph.icon));
		button.setAttribute("aria-label", spec.label(LL));
		button.addEventListener("click", () => {
			spec.run(editor);
		});
		bar.appendChild(button);
		return { spec, button };
	});

	container.appendChild(bar);

	function sync() {
		for (const { spec, button } of buttons) {
			const active = spec.isActive(editor);
			button.classList.toggle(styles.active, active);
			button.setAttribute("aria-pressed", String(active));
		}
	}

	// onUpdate misses selection changes, and moving the cursor into bold text
	// has to light the button up.
	editor.on("transaction", sync);
	sync();

	// Returned so the style dropdown can mount into the row rather than beside it.
	return bar;
}
