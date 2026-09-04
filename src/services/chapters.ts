import { formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { marked } from "marked";
import TurndownService from "turndown";
import { ATTRIBUTE_STYLE_IDS } from "../components/editor/styles-catalog";
import { bus } from "../core/bus";
import { store } from "../core/store";
import { getLL } from "../i18n";
import type { ChapterMeta, Doc } from "../types";
import { readChapter, renameChapter } from "./invoke";

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
	// Match the ** of strong, rather than turndown's default _
	emDelimiter: "*",
});

// Paragraph styles with no markdown equivalent ride on a marker comment sitting
// on the line above the paragraph. The "sietch:" namespace keeps them from
// colliding with comments another tool put in the file.
const STYLE_MARKER = /^\s*sietch:([a-z0-9-]+)\s*$/;

// A styled paragraph only. Without the attribute this rule never fires and the
// document takes turndown's built-in paragraph path, byte for byte as before.
turndown.addRule("sietchParagraphStyle", {
	filter: (node) => node.nodeName === "P" && node.hasAttribute("data-style"),
	replacement: (content, node) =>
		`\n\n<!-- sietch:${(node as HTMLElement).getAttribute("data-style")} -->\n${content}\n\n`,
});

/**
 * Folds the marker comments into `data-style` on the paragraph each one
 * introduces, and drops the comment.
 *
 * This has to happen before TipTap sees the HTML: ProseMirror's DOM parser has
 * no node type for a comment and discards it silently, so a marker left in
 * place is a style lost on load.
 */
function applyStyleMarkers(root: DocumentFragment): void {
	const walker = document.createNodeIterator(root, NodeFilter.SHOW_COMMENT);
	const ours: Comment[] = [];

	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		const comment = node as Comment;
		const name = STYLE_MARKER.exec(comment.data)?.[1];
		if (name === undefined) continue;

		// Ours by namespace, so it goes either way. An unknown name or a marker
		// introducing something that is not a paragraph just loses the style —
		// the text it sits above is never touched.
		ours.push(comment);
		const target = comment.nextElementSibling;
		if (target?.tagName === "P" && ATTRIBUTE_STYLE_IDS.has(name)) {
			target.setAttribute("data-style", name);
		}
	}

	for (const comment of ours) comment.remove();
}

// Chapters are markdown on disk and HTML inside TipTap, so every read and
// write crosses one of these two functions.
export function markdownToHtml(markdown: string): string {
	const html = marked(markdown, { async: false });
	// The overwhelmingly common case is a manuscript with no markers at all.
	if (!html.includes("<!--")) return html;

	const template = document.createElement("template");
	template.innerHTML = html;
	applyStyleMarkers(template.content);
	return template.innerHTML;
}

export function htmlToMarkdown(html: string): string {
	return turndown.turndown(html);
}

// Maps a chapter from the backend onto the UI's document model.
// `preview` and `meta` are the sidebar's two lines.
export function toDoc(chapter: ChapterMeta, content = ""): Doc {
	const LL = getLL();
	const modified = new Date(chapter.modified);
	return {
		id: chapter.id,
		title: chapter.title,
		type: chapter.type,
		language: chapter.language,
		tags: chapter.tags,
		content,
		words: chapter.word_count,
		preview: LL.wordCount({ count: chapter.word_count }),
		meta: formatDistanceToNow(modified, {
			addSuffix: true,
			locale: store.get("locale").startsWith("es") ? es : enUS,
		}),
		notes: "",
		createdAt: modified,
		updatedAt: modified,
	};
}

// Reads a chapter off disk and hands it to the editor.
export async function openChapter(doc: Doc): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	const { frontmatter, body } = await readChapter(projectPath, doc.id);
	// Named one by one: the frontmatter must not overwrite the counts and
	// timestamps the listing already put on the doc.
	const loaded: Doc = {
		...doc,
		title: frontmatter.title,
		type: frontmatter.type,
		language: frontmatter.language,
		tags: frontmatter.tags,
		content: markdownToHtml(body),
	};
	store.set("activeDoc", loaded);
	bus.emit("document:load", loaded);
}

// The title is the only thing telling two sidebar rows apart, so no two chapters
// may share one. Compared exactly: "Dune" and "dune" read as different rows.
export function isTitleTaken(docs: Doc[], id: string, title: string): boolean {
	return docs.some((d) => d.id !== id && d.title === title);
}

// Renames a chapter. The backend only rewrites the frontmatter title, so the body
// and the file path are untouched. Blank and unchanged are silent no-ops;
// "duplicate" comes back so the caller can leave the field open to be fixed.
export async function commitRename(
	doc: Doc,
	raw: string,
): Promise<"duplicate" | null> {
	const projectPath = store.get("projectPath");
	const title = raw.trim();
	if (!projectPath || !title || title === doc.title) return null;
	if (isTitleTaken(store.get("documents"), doc.id, title)) return "duplicate";

	const meta = await renameChapter(projectPath, doc.id, title);
	// Mirrors the map in the editor's persist(). Kept separate because a rename
	// also has to refresh activeDoc and an autosave must not.
	store.set(
		"documents",
		store
			.get("documents")
			.map((d) =>
				d.id === meta.id ? { ...toDoc(meta, d.content), notes: d.notes } : d,
			),
	);

	const active = store.get("activeDoc");
	if (active?.id === meta.id) {
		store.set("activeDoc", { ...active, title: meta.title });
	}
	return null;
}

// New chapters are all born "Untitled", so the sidebar needs a suffix to tell
// apart the ones nobody has renamed yet. Pick the first free one.
export function nextUntitledTitle(taken: string[], base: string): string {
	if (!taken.includes(base)) return base;
	let n = 2;
	while (taken.includes(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}
