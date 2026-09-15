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

/**
 * One entry under `research/`, as `list_research` returns it. Shaped like
 * `TreeNode` so the sidebar can walk it; the item adds what a file row needs.
 * The id is `research/` plus the path below it, with `/` on every platform.
 */
export type ResearchNode =
	| { type: "folder"; id: string; title: string; children: ResearchNode[] }
	| ResearchItem;

export interface ResearchItem {
	type: "item";
	id: string;
	/** `markdown` and `link` open in the editor, `file` in the OS default app. */
	kind: "markdown" | "link" | "file";
	title: string;
	/** Empty for anything that is not a link. */
	url: string;
}

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
	/**
	 * What kind of writing this project holds: `novel`, `longform`, `thesis`,
	 * `blog`, or a name this version has never heard of. A project written
	 * before the field reads as `novel`. Nothing branches on it yet — F-074 is
	 * the first view that is not offered to every project.
	 */
	project_type: string;
	tree: TreeNode[];
	/** Chapters sitting in `trash/`, and when each one went there. */
	trash: TrashEntry[];
	/**
	 * Palette color for each tag, by tag name. Project-wide, because a tag
	 * means the same thing in every chapter carrying it — the names themselves
	 * live in each file's frontmatter, where they travel with the file.
	 *
	 * A name outside {@link TAG_COLORS} paints nothing. See `services/tags.ts`.
	 */
	tag_colors: Record<string, string>;
}

/**
 * One chapter in `trash/`. The title is not copied here — it is still in the
 * file's own frontmatter, where every other chapter keeps it.
 */
export interface TrashEntry {
	id: string;
	/** RFC3339, stamped when the file was moved. */
	deleted: string;
}

/**
 * A chapter in `trash/` as `list_trash` hands it over: the metadata read out of
 * the file itself, plus the date the array recorded. `deleted` is null for a
 * file nothing in Fulgurita put there, which is still a file in the trash.
 */
export interface TrashItem extends ChapterMeta {
	deleted: string | null;
}

/**
 * The YAML block at the top of every document, mirroring the Rust struct.
 *
 * A file may carry more than this — written by hand or by a later version of
 * Fulgurita. Those fields are never sent here and never sent back: the backend
 * splices around the block instead of rebuilding it, so they survive a save.
 */
export interface Frontmatter {
	id: string;
	type: string;
	language: string;
	title: string;
	tags: string[];
	/**
	 * Absent, not empty, when the chapter has none — the backend skips the key
	 * when it is empty so a file nobody has summarised carries no `synopsis:`
	 * line, and the same rule reaches this payload. `ChapterMeta` always has it.
	 */
	synopsis?: string;
	/**
	 * Whose eyes the chapter is told through. Absent, not empty, when nobody
	 * has assigned one — skipped on the way out for the same reason
	 * `synopsis` is.
	 */
	pov?: string;
	/** Where a `link` document points. Absent on everything else. */
	url?: string;
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
	synopsis: string;
	/** Always present, empty when the file has no `pov` key. */
	pov: string;
	word_count: number;
	modified: string;
}

/**
 * What a view asks `query_docs` for. Every field is optional, so `{}` is every
 * document in the project.
 *
 * `pov: ""` is not the same as leaving `pov` out: it selects the documents
 * nobody has assigned a POV to, which is a group of its own.
 */
export interface DocFilter {
	type?: string;
	tag?: string;
	pov?: string;
	orderBy?: "title" | "modified";
}

export interface Doc {
	id: string;
	title: string;
	/** Document kind from the frontmatter. Only `chapter` exists today. */
	type: string;
	language: string;
	tags: string[];
	/** What the chapter is about. Empty until the writer fills it in. */
	synopsis: string;
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

/** Follow the OS appearance, or pin one. What the writer picked, not what shows. */
export type ThemePref = "system" | "light" | "dark";

/** Where the current chapter stands relative to disk. Ephemeral: never persisted. */
export type SaveState = "saved" | "saving" | "error";

export interface StoreState {
	documents: Doc[];
	activeDoc: Doc | null;
	stats: EditorStats;
	outline: OutlineItem[];
	theme: ThemePref;
	/** What is actually on screen. Derived from `theme`: never persisted. */
	resolvedTheme: "light" | "dark";
	sidebarOpen: boolean;
	inspectorOpen: boolean;
	focusMode: boolean;
	/** Typewriter scrolling. Only takes effect while focusMode is on. */
	typewriter: boolean;
	dailyGoal: number;
	locale: string;
	projectMeta: ProjectMeta | null;
	projectPath: string | null;
	/** Folder a new chapter or folder is created in. Runtime only. */
	selectedFolder: string | null;
	/**
	 * What is in `trash/`, as rows. Runtime only, and read from disk on the way
	 * into the view rather than kept in step with every delete.
	 */
	trash: Doc[];
	/** What is in `research/`. Runtime only, re-read whenever the folder changes. */
	research: ResearchNode[];
	saveState: SaveState;
	/**
	 * Why the last write was refused, verbatim from the backend. Ephemeral, like
	 * `saveState`. The statusbar hangs it off the indicator as a tooltip: a
	 * refused write names a file the writer has to go repair by hand, and
	 * "Error" on its own does not tell them that.
	 */
	saveError: string | null;
	/**
	 * Why the project's chapters did not load, verbatim from the backend. Runtime
	 * only. The tree arrives before the chapters, so without this a failed load
	 * leaves the sidebar drawing folders and silently skipping every chapter.
	 */
	loadError: string | null;
}

export type ConfigKeys =
	| "theme"
	| "sidebarOpen"
	| "inspectorOpen"
	| "focusMode"
	| "typewriter"
	| "dailyGoal"
	| "locale";

export interface Config extends Pick<StoreState, ConfigKeys> {
	sidebarWidth: number;
	inspectorWidth: number;
}

export interface BusEvents {
	"document:new": undefined;
	"folder:new": undefined;
	/** Chapter id. Handled in main.ts, which owns the editor's flush. */
	"document:delete": string;
	/** Folder id. Takes the chapters under it with it, after a confirmation. */
	"folder:delete": string;
	/** Chapter id, from the trash view. Handled in main.ts beside the deletes. */
	"document:restore": string;
	/** Ready-made sentence for the sidebar's live region. */
	"tree:announce": string;
	/**
	 * Node id. Opens the sidebar's inline rename on that row — the field belongs
	 * to the sidebar, and the menu item that asks for it belongs to a provider.
	 */
	"tree:rename": string;
	/** Provider id. The palette's way to the view menu in the sidebar header. */
	"view:show": string;
	"document:load": Doc;
	"document:save": undefined;
	/**
	 * Document ids whose file changed on disk, from the backend's watcher. Our
	 * own saves land here too; the editor tells them apart by content.
	 */
	"docs:changed": string[];
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
