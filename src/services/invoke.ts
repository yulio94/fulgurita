import { invoke } from "@tauri-apps/api/core";
import type {
	ChapterContent,
	ChapterMeta,
	ProjectMeta,
	TreeNode,
} from "../types";

/** `language` seeds the frontmatter of every document created in the project. */
export function createProject(
	name: string,
	path: string,
	language: string,
): Promise<ProjectMeta> {
	return invoke<ProjectMeta>("create_project", { name, path, language });
}

/**
 * `language` is the app's locale. It is written into `sietch.json` only when the
 * project predates the field — an ordinary open never touches the file.
 */
export function openProject(
	path: string,
	language: string,
): Promise<ProjectMeta> {
	return invoke<ProjectMeta>("open_project", { path, language });
}

/** Resolves to the stored tag, which is trimmed. Chapter files are untouched. */
export function setProjectLanguage(
	projectPath: string,
	language: string,
): Promise<string> {
	return invoke<string>("set_project_language", {
		path: projectPath,
		language,
	});
}

export function listChapters(projectPath: string): Promise<ChapterMeta[]> {
	return invoke<ChapterMeta[]>("list_chapters", { projectPath });
}

export function createChapter(
	projectPath: string,
	title: string,
	parent: string | null = null,
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("create_chapter", { projectPath, title, parent });
}

/** Resolves to the folder node itself, ready to splice into the tree. */
export function createFolder(
	projectPath: string,
	title: string,
	parent: string | null = null,
): Promise<TreeNode> {
	return invoke<TreeNode>("create_folder", { projectPath, title, parent });
}

/** Resolves to the stored title, which is trimmed. */
export function renameFolder(
	projectPath: string,
	id: string,
	title: string,
): Promise<string> {
	return invoke<string>("rename_folder", { projectPath, id, title });
}

/**
 * Moves a node to a new place in the tree. `parent` is the folder it lands in,
 * or the root when null; `before` is the sibling it lands in front of, or the
 * end of that folder when null. Rejects a folder asked to hold itself, and an
 * id that is not in the tree, without writing anything.
 */
export function moveNode(
	projectPath: string,
	id: string,
	parent: string | null,
	before: string | null,
): Promise<void> {
	return invoke<void>("move_node", { projectPath, id, parent, before });
}

/** Deletes a folder and moves every chapter under it to `trash/`. */
export function deleteFolder(projectPath: string, id: string): Promise<void> {
	return invoke<void>("delete_folder", { projectPath, id });
}

/** Moves a chapter's file to `trash/` and drops it from the tree. */
export function deleteChapter(projectPath: string, id: string): Promise<void> {
	return invoke<void>("delete_chapter", { projectPath, id });
}

/** Brings a chapter back from `trash/`, appended to the root of the tree. */
export function restoreChapter(
	projectPath: string,
	id: string,
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("restore_chapter", { projectPath, id });
}

/** Resolves to the frontmatter and the body, split apart. */
export function readChapter(
	projectPath: string,
	id: string,
): Promise<ChapterContent> {
	return invoke<ChapterContent>("read_chapter", { projectPath, id });
}

export function renameChapter(
	projectPath: string,
	id: string,
	title: string,
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("rename_chapter", { projectPath, id, title });
}

/**
 * Sends the body only. The frontmatter stays on disk and is spliced around, so
 * fields this app does not model are never at risk from an autosave.
 */
export function saveChapter(
	projectPath: string,
	id: string,
	content: string,
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("save_chapter", { projectPath, id, content });
}

/**
 * Sends the whole list, not an add or a remove. The file is rewritten either
 * way and the Inspector already holds every tag it is drawing.
 *
 * Resolves to the normalised list — trimmed, deduped — which is what the chips
 * are rebuilt from.
 */
export function setChapterTags(
	projectPath: string,
	id: string,
	tags: string[],
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("set_chapter_tags", { projectPath, id, tags });
}

/** Project-wide, and stored in `sietch.json`. An empty `color` clears it. */
export function setTagColor(
	projectPath: string,
	tag: string,
	color: string,
): Promise<void> {
	return invoke<void>("set_tag_color", { projectPath, tag, color });
}
