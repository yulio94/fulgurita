export interface ProjectMeta {
	name: string;
	author: string;
	created: string;
	modified: string;
	version: string;
	chapter_order: string[];
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
