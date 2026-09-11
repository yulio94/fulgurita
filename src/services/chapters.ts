import { formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { marked } from "marked";
import TurndownService from "turndown";
import { ATTRIBUTE_STYLE_IDS } from "../components/editor/styles-catalog";
import { bus } from "../core/bus";
import { store } from "../core/store";
import { getLL } from "../i18n";
import type { ChapterMeta, Doc, TrashItem } from "../types";
import {
	queryDocs,
	readChapter,
	renameChapter,
	setChapterSynopsis,
	setChapterTags,
} from "./invoke";

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
		synopsis: chapter.synopsis,
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

// The same row, drawn for the trash view. `preview` stays the word count; the
// second line answers the question the trash raises instead, which is when the
// chapter went there. A file nobody deleted has no date to give.
export function toTrashDoc(item: TrashItem): Doc {
	const LL = getLL();
	const doc = toDoc(item);
	if (!item.deleted) return { ...doc, meta: LL.inTheTrash() };
	return {
		...doc,
		meta: LL.deletedAgo({
			when: formatDistanceToNow(new Date(item.deleted), {
				addSuffix: true,
				locale: store.get("locale").startsWith("es") ? es : enUS,
			}),
		}),
	};
}

// Re-reads the metadata of every document after a change on disk, so a title or
// tag edited in another app reaches the sidebar. queryDocs walks every document
// folder, not just the tree. Ids the store does not hold are ignored, and a doc
// whose file is gone keeps its row until the next listing.
// ponytail: reads every file per change. Fine at novel scale; take the changed
// ids and read only those if a project ever gets big enough to notice.
export async function refreshDocuments(): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	const fresh = new Map(
		(await queryDocs(projectPath)).map((meta) => [meta.id, meta]),
	);
	store.set(
		"documents",
		store.get("documents").map((d) => {
			const meta = fresh.get(d.id);
			// Notes live in memory only until F-023, same as the save path
			return meta ? { ...toDoc(meta, d.content), notes: d.notes } : d;
		}),
	);
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
		// Absent means the file has no synopsis key, which is the same thing as
		// not having written one
		synopsis: frontmatter.synopsis ?? "",
		content: markdownToHtml(body),
	};
	store.set("activeDoc", loaded);
	bus.emit("document:load", loaded);
}

// The title is the only thing telling two sidebar rows apart, so no two chapters
// may share one. Compared exactly: "Prologue" and "prologue" read as two rows.
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

	let meta: ChapterMeta;
	try {
		meta = await renameChapter(projectPath, doc.id, title);
	} catch (err) {
		// A rename is refused the same way a save is — a chapter whose frontmatter
		// is broken must not be written to. Reported through the same indicator.
		// Returning null lets both callers take their ordinary path: they re-read
		// the title from the store, which is still the one on disk.
		store.set("saveError", String(err));
		store.set("saveState", "error");
		console.error(err);
		return null;
	}

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

// Writes a chapter's tags. The backend rewrites one frontmatter entry, so the
// body and every other field are untouched, and it hands back the normalised
// list the chips are then rebuilt from.
export async function commitTags(doc: Doc, tags: string[]): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	let meta: ChapterMeta;
	try {
		meta = await setChapterTags(projectPath, doc.id, tags);
	} catch (err) {
		// A chapter whose frontmatter is broken refuses this write the same way
		// it refuses a save, and reports through the same indicator.
		store.set("saveError", String(err));
		store.set("saveState", "error");
		console.error(err);
		return;
	}

	store.set(
		"documents",
		store
			.get("documents")
			.map((d) =>
				d.id === meta.id ? { ...toDoc(meta, d.content), notes: d.notes } : d,
			),
	);

	// persist() deliberately leaves activeDoc alone, so the chips have nothing
	// to re-render from unless this patches it.
	const active = store.get("activeDoc");
	if (active?.id === meta.id) {
		store.set("activeDoc", { ...active, tags: meta.tags });
	}
}

// Writes a chapter's synopsis. Same shape as commitTags — one frontmatter entry
// rewritten, the body and every other field untouched — and the same refusal on
// a broken block. Unchanged text is a silent no-op, which is what lets the field
// fire on every blur.
export async function commitSynopsis(
	doc: Doc,
	synopsis: string,
): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath || synopsis === doc.synopsis) return;

	let meta: ChapterMeta;
	try {
		meta = await setChapterSynopsis(projectPath, doc.id, synopsis);
	} catch (err) {
		store.set("saveError", String(err));
		store.set("saveState", "error");
		console.error(err);
		return;
	}

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
		store.set("activeDoc", { ...active, synopsis: meta.synopsis });
	}
}

// New chapters are all born "Untitled", so the sidebar needs a suffix to tell
// apart the ones nobody has renamed yet. Pick the first free one.
export function nextUntitledTitle(taken: string[], base: string): string {
	if (!taken.includes(base)) return base;
	let n = 2;
	while (taken.includes(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}

/**
 * Which chapter to open once `gone` has been deleted, given the list as it was
 * before. The row that took the deleted one's place, or the one above it when
 * it was last. `null` means the project has no chapters left.
 *
 * Pulled out of main.ts because it is the one branchy part of a delete, and
 * main.ts calls `bootstrap()` on import, so nothing in it can be reached here.
 */
export function nextAfterDelete(
	before: Doc[],
	activeId: string,
	gone: Set<string>,
): Doc | null {
	const left = before.filter((doc) => !gone.has(doc.id));
	if (left.length === 0) return null;
	const index = before.findIndex((doc) => doc.id === activeId);
	return left[Math.min(index, left.length - 1)];
}
