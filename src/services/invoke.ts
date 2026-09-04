import { invoke } from "@tauri-apps/api/core";
import type { ChapterMeta, ProjectMeta } from "../types";

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
): Promise<ChapterMeta> {
	return invoke<ChapterMeta>("create_chapter", { projectPath, title });
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
