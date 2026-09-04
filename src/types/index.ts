/**
 * A node of the project tree, mirroring the Rust `Node` enum.
 *
 * Folders are categories: they hold any kind of leaf and own no file. A leaf
 * carries its `kind`, so characters and notes join the same tree later without
 * a second one.
 */
export type TreeNode =
	| { type: "folder"; id: string; title: string; children: TreeNode[] }
	| { type: "item"; id: string; kind: string };

export type FolderNode = Extract<TreeNode, { type: "folder" }>;

export interface ProjectMeta {
	name: string;
	author: string;
	created: string;
	modified: string;
	version: string;
	tree: TreeNode[];
}

// Chapter metadata as returned by the Rust `chapter` commands.
export interface ChapterMeta {
	id: string;
	title: string;
	word_count: number;
	modified: string;
}

export interface Doc {
	id: string;
	title: string;
	content: string;
	preview: string;
	meta: string;
	notes: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface EditorStats {
	words: number;
	characters: number;
	paragraphs: number;
	readingTime: string;
}

export interface OutlineItem {
	id: string;
	text: string;
	level: number;
}

export interface CommandItem {
	id: string;
	category: string;
	label: string;
	shortcut?: string;
	action: () => void;
}

/** Where the current chapter stands relative to disk. Ephemeral: never persisted. */
export type SaveState = "saved" | "saving" | "error";

export interface StoreState {
	documents: Doc[];
	activeDoc: Doc | null;
	stats: EditorStats;
	outline: OutlineItem[];
	theme: "light" | "dark";
	sidebarOpen: boolean;
	inspectorOpen: boolean;
	focusMode: boolean;
	dailyGoal: number;
	locale: string;
	projectMeta: ProjectMeta | null;
	projectPath: string | null;
	/** Folder a new chapter or folder is created in. Runtime only. */
	selectedFolder: string | null;
	saveState: SaveState;
}

export type ConfigKeys =
	| "theme"
	| "sidebarOpen"
	| "inspectorOpen"
	| "focusMode"
	| "dailyGoal"
	| "locale";

export interface Config extends Pick<StoreState, ConfigKeys> {
	sidebarWidth: number;
	inspectorWidth: number;
}

export interface BusEvents {
	"document:new": undefined;
	"folder:new": undefined;
	"document:load": Doc;
	"document:save": undefined;
	"editor:scroll-to": OutlineItem;
	"panel:toggle-sidebar": undefined;
	"panel:toggle-inspector": undefined;
	"palette:open": undefined;
	"palette:close": undefined;
	"theme:toggle": undefined;
	"focus:toggle": undefined;
	"locale:change": string;
	"project:loaded": ProjectMeta;
	"project:closed": undefined;
}
