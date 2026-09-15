import { bus } from "../core/bus";
import { store } from "../core/store";
import type { Doc, ResearchItem, ResearchNode } from "../types";
import { markdownToHtml } from "./chapters";
import { listResearch, openResearchFile, readResearch } from "./invoke";

const ID_PREFIX = "research/";

/**
 * A research document is open. The id says so: research ids start with the
 * folder and chapter ids are UUIDs, which never hold a `/`.
 */
export function isResearch(doc: Doc | null): boolean {
	return doc?.id.startsWith(ID_PREFIX) ?? false;
}

/**
 * Reads `research/` into the store, which repaints the sidebar. Called on the
 * way into the view and whenever the watcher sees the folder change.
 */
export async function loadResearch(): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;
	try {
		store.set("research", await listResearch(projectPath));
	} catch (err) {
		// Browser-only dev has no backend, and a folder can go away under a
		// running app. Either way the view shows what it last had.
		console.error(err);
	}
}

/**
 * The row a research file draws as. Never enters `documents`, so it counts
 * toward no total and shows up in no chapter list.
 *
 * `type` carries the kind. The second line is the link's host, or the file's
 * extension. The third is the file name, but only when it is not what the title
 * already says: two links saved as "Atlas" are `Atlas.md` and `Atlas 2.md`.
 */
export function toResearchDoc(item: ResearchItem): Doc {
	const never = new Date(0);
	const name = item.id.slice(item.id.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	return {
		id: item.id,
		title: item.title,
		type: item.kind,
		language: "",
		tags: [],
		synopsis: "",
		content: "",
		words: 0,
		preview:
			item.kind === "link"
				? host(item.url)
				: dot > 0
					? name.slice(dot + 1).toUpperCase()
					: "",
		meta: stem === item.title || name === item.title ? "" : name,
		notes: "",
		createdAt: never,
		updatedAt: never,
	};
}

export function host(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/**
 * The href a chapter stores for a research item. Relative to `chapters/`, where
 * the chapter file lives, so the link works in any markdown editor too.
 */
export function researchHref(id: string): string {
	return `../${encodeURI(id)}`;
}

/**
 * The research id an href points at, or null for anything else. marked encodes
 * an href on load and turndown writes it back as it found it, so a stored link
 * may or may not be encoded, and both have to match.
 */
export function researchIdFromHref(href: string): string | null {
	let path: string;
	try {
		path = decodeURI(href);
	} catch {
		return null;
	}
	const id = path.startsWith("../") ? path.slice(3) : path;
	return id.startsWith(ID_PREFIX) ? id : null;
}

/** The research item with this id, anywhere in the tree the store holds. */
export function findResearchItem(
	id: string,
	nodes: ResearchNode[] = store.get("research"),
): ResearchItem | null {
	for (const node of nodes) {
		if (node.type === "item" && node.id === id) return node;
		if (node.type === "folder" && id.startsWith(`${node.id}/`)) {
			return findResearchItem(id, node.children);
		}
	}
	return null;
}

/** Hands any research file to the OS, whatever its kind. */
export async function openInDefaultApp(id: string): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;
	try {
		await openResearchFile(projectPath, id);
	} catch (err) {
		// ponytail: logged only. A file type with no app for it fails here;
		// surface it in the UI if writers run into that.
		console.error(err);
	}
}

/** Opens an item: markdown and links in the editor, anything else in its app. */
export async function openResearchItem(item: ResearchItem): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;
	if (item.kind === "file") return openInDefaultApp(item.id);

	const body = await readResearch(projectPath, item.id);
	// A link's URL lives in its frontmatter, which the body leaves out. An
	// autolink on top puts it where the writer can see and follow it.
	const markdown = item.kind === "link" ? `<${item.url}>\n\n${body}` : body;
	const loaded: Doc = {
		...toResearchDoc(item),
		content: markdownToHtml(markdown),
	};
	store.set("activeDoc", loaded);
	bus.emit("document:load", loaded);
}

/**
 * Follows a research link out of the text. `from` is the chapter to come back
 * to, which only matters when the item replaces it in the editor. False when the
 * link points at nothing in the folder any more.
 */
export async function openResearchById(
	id: string,
	from: Doc | null,
): Promise<boolean> {
	if (store.get("research").length === 0) await loadResearch();
	const item = findResearchItem(id);
	if (!item) return false;

	if (item.kind !== "file" && from) {
		// Flush the chapter first, the way the sidebar does before a switch
		bus.emit("document:save");
		store.set("researchReturn", from);
	}
	await openResearchItem(item);
	return true;
}
