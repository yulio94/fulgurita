import { invoke } from "@tauri-apps/api/core";
import type { ChapterMeta, ProjectMeta, TreeNode } from "../types";

export function createProject(
	name: string,
	path: string,
): Promise<ProjectMeta> {
	return invoke<ProjectMeta>("create_project", { name, path });
}

export function openProject(path: string): Promise<ProjectMeta> {
	return invoke<ProjectMeta>("open_project", { path });
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

export function deleteFolder(projectPath: string, id: string): Promise<void> {
	return invoke<void>("delete_folder", { projectPath, id });
}

export function readChapter(projectPath: string, id: string): Promise<string> {
	return invoke<string>("read_chapter", { projectPath, id });
}

export function renameChapter(
	projectPath: string,
	id: string,
	title: string,
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("rename_chapter", { projectPath, id, title });
}

export function saveChapter(
	projectPath: string,
	id: string,
	content: string,
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("save_chapter", { projectPath, id, content });
}
