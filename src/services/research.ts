import { bus } from "../core/bus";
import { store } from "../core/store";
import type { Doc, ResearchItem } from "../types";
import { markdownToHtml } from "./chapters";
import { listResearch, readResearch } from "./invoke";

/**
 * A research document is open. The id says so: research ids start with the
 * folder and chapter ids are UUIDs, which never hold a `/`.
 */
export function isResearch(doc: Doc | null): boolean {
	return doc?.id.startsWith("research/") ?? false;
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
 * `type` carries the kind, which is all `open` needs to pick a path. The second
 * line is the link's host, or the file's extension.
 */
export function toResearchDoc(item: ResearchItem): Doc {
	const never = new Date(0);
	return {
		id: item.id,
		title: item.title,
		type: item.kind,
		language: "",
		tags: [],
		synopsis: "",
		content: "",
		words: 0,
		preview: item.kind === "link" ? host(item.url) : extension(item.id),
		meta: "",
		notes: "",
		createdAt: never,
		updatedAt: never,
	};
}

function host(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

function extension(id: string): string {
	const name = id.slice(id.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toUpperCase() : "";
}

/** Reads a research document and hands it to the editor, which shows it read-only. */
export async function openResearch(doc: Doc): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	const body = await readResearch(projectPath, doc.id);
	const loaded: Doc = { ...doc, content: markdownToHtml(body) };
	store.set("activeDoc", loaded);
	bus.emit("document:load", loaded);
}
