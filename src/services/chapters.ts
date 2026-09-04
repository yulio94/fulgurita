import { formatDistanceToNow } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { marked } from "marked";
import TurndownService from "turndown";
import { bus } from "../core/bus";
import { store } from "../core/store";
import { getLL } from "../i18n";
import type { ChapterMeta, Doc } from "../types";
import { readChapter } from "./invoke";

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
	// Match the ** of strong, rather than turndown's default _
	emDelimiter: "*",
});

// Chapters are markdown on disk and HTML inside TipTap, so every read and
// write crosses one of these two functions.
export function markdownToHtml(markdown: string): string {
	return marked(markdown, { async: false });
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
		content,
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

	const markdown = await readChapter(projectPath, doc.id);
	const loaded: Doc = { ...doc, content: markdownToHtml(markdown) };
	store.set("activeDoc", loaded);
	bus.emit("document:load", loaded);
}

// New chapters are all born "Untitled". Until F-021 lands rename, the only thing
// separating them in the sidebar is a suffix, so pick the first free one.
export function nextUntitledTitle(taken: string[], base: string): string {
	if (!taken.includes(base)) return base;
	let n = 2;
	while (taken.includes(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}
