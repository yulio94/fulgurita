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
	/** On-disk layout of the project. A project written before this field is 1. */
	format_version: number;
	/** Language new documents are written in. A file's frontmatter overrides it. */
	language: string;
	tree: TreeNode[];
}

/**
 * The YAML block at the top of every document, mirroring the Rust struct.
 *
 * A file may carry more than this — written by hand or by a later version of
 * Sietch. Those fields are never sent here and never sent back: the backend
 * splices around the block instead of rebuilding it, so they survive a save.
 */
export interface Frontmatter {
	id: string;
	type: string;
	language: string;
	title: string;
	tags: string[];
}

/** A chapter file as `read_chapter` returns it. */
export interface ChapterContent {
	frontmatter: Frontmatter;
	body: string;
}

// Chapter metadata as returned by the Rust `chapter` commands.
export interface ChapterMeta {
	id: string;
	title: string;
	type: string;
	language: string;
	tags: string[];
	word_count: number;
	modified: string;
}

export interface Doc {
	id: string;
	title: string;
	/** Document kind from the frontmatter. Only `chapter` exists today. */
	type: string;
	language: string;
	tags: string[];
	content: string;
	/** Words on disk. One autosave behind for the chapter that is open. */
	words: number;
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
	/**
	 * Why the last write was refused, verbatim from the backend. Ephemeral, like
	 * `saveState`. The statusbar hangs it off the indicator as a tooltip: a
	 * refused write names a file the writer has to go repair by hand, and
	 * "Error" on its own does not tell them that.
	 */
	saveError: string | null;
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
	"palette:open-docs": undefined;
	"palette:close": undefined;
	"theme:toggle": undefined;
	"focus:toggle": undefined;
	"settings:open": undefined;
	"app:restart": undefined;
	"project:loaded": ProjectMeta;
	"project:closed": undefined;
}
