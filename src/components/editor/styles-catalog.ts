import type { Editor } from "@tiptap/core";
import type { getLL } from "../../i18n";

export interface ParagraphStyleSpec {
	id: string;
	label: (LL: ReturnType<typeof getLL>) => string;
	/**
	 * "node" styles are real markdown constructs and serialize on their own.
	 * "style" styles have no markdown equivalent and ride on a marker comment.
	 */
	kind: "node" | "style";
	run: (editor: Editor) => void;
	isActive: (editor: Editor) => boolean;
}

/** The plain paragraph. Also the fallback when nothing else matches. */
export const NO_STYLE_ID = "none";

/**
 * Every paragraph style the app offers, in the order the dropdown lists them.
 *
 * Single source of truth: the dropdown renders from here, and the markdown
 * converter takes its set of valid marker names from here.
 */
export const PARAGRAPH_STYLES: ParagraphStyleSpec[] = [
	{
		id: NO_STYLE_ID,
		label: (LL) => LL.styleNoStyle(),
		kind: "node",
		run: (e) => e.chain().focus().unsetParagraphStyle().run(),
		isActive: (e) => e.isActive("paragraph", { styleName: null }),
	},
	// The heading levels are shifted by one against their labels on purpose: a
	// chapter's own name is the Title, so the first heading a writer nests under
	// it is h2. That is also what keeps one h1 per document for export.
	{
		id: "title",
		label: (LL) => LL.styleTitle(),
		kind: "node",
		run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
		isActive: (e) => e.isActive("heading", { level: 1 }),
	},
	{
		id: "heading1",
		label: (LL) => LL.styleHeading1(),
		kind: "node",
		run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
		isActive: (e) => e.isActive("heading", { level: 2 }),
	},
	{
		id: "heading2",
		label: (LL) => LL.styleHeading2(),
		kind: "node",
		run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
		isActive: (e) => e.isActive("heading", { level: 3 }),
	},
	{
		id: "heading3",
		label: (LL) => LL.styleHeading3(),
		kind: "node",
		run: (e) => e.chain().focus().setHeading({ level: 4 }).run(),
		isActive: (e) => e.isActive("heading", { level: 4 }),
	},
	{
		id: "blockquote",
		label: (LL) => LL.styleBlockQuote(),
		kind: "node",
		run: (e) => e.chain().focus().toggleBlockquote().run(),
		isActive: (e) => e.isActive("blockquote"),
	},
	{
		id: "codeblock",
		label: (LL) => LL.styleCodeBlock(),
		kind: "node",
		run: (e) => e.chain().focus().toggleCodeBlock().run(),
		isActive: (e) => e.isActive("codeBlock"),
	},
	{
		id: "attribution",
		label: (LL) => LL.styleAttribution(),
		kind: "style",
		run: (e) => e.chain().focus().setParagraphStyle("attribution").run(),
		isActive: (e) => e.isActive("paragraph", { styleName: "attribution" }),
	},
	{
		id: "caption",
		label: (LL) => LL.styleCaption(),
		kind: "style",
		run: (e) => e.chain().focus().setParagraphStyle("caption").run(),
		isActive: (e) => e.isActive("paragraph", { styleName: "caption" }),
	},
	{
		id: "verse",
		label: (LL) => LL.styleVerse(),
		kind: "style",
		run: (e) => e.chain().focus().setParagraphStyle("verse").run(),
		isActive: (e) => e.isActive("paragraph", { styleName: "verse" }),
	},
	{
		id: "centered",
		label: (LL) => LL.styleCentered(),
		kind: "style",
		run: (e) => e.chain().focus().setParagraphStyle("centered").run(),
		isActive: (e) => e.isActive("paragraph", { styleName: "centered" }),
	},
];

/**
 * Marker names the converter will honour. An id outside this set is not ours,
 * and the paragraph carrying it loads unstyled.
 */
export const ATTRIBUTE_STYLE_IDS: ReadonlySet<string> = new Set(
	PARAGRAPH_STYLES.filter((s) => s.kind === "style").map((s) => s.id),
);

/**
 * The style shown as active for the cursor's block.
 *
 * No Style is checked last, not first. A blockquote holds a paragraph, so with
 * the cursor inside one `isActive("paragraph", { styleName: null })` is true and
 * a first-hit-wins scan over the list in display order would label every
 * blockquote "No Style".
 */
export function resolveActiveStyle(editor: Editor): ParagraphStyleSpec {
	const none = PARAGRAPH_STYLES[0];
	return (
		PARAGRAPH_STYLES.find((s) => s.id !== NO_STYLE_ID && s.isActive(editor)) ??
		none
	);
}
