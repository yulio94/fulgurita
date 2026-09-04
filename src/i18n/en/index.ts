import type { BaseTranslation } from "../i18n-types.js";

const en = {
	// Sidebar
	library: "Library",
	newDocument: "+",
	newChapterLabel: "New chapter",
	newFolder: "New folder",
	folder: "Folder",
	folderTitleLabel: "Folder title",
	deleteFolder: "Delete folder",
	expandFolder: "Expand",
	collapseFolder: "Collapse",
	folderNotEmpty: "Only an empty folder can be deleted.",
	projectTitle: "Untitled Project",

	// Editor
	placeholder: "Begin writing...",
	untitled: "Untitled",
	chapterTitleLabel: "Chapter title",
	justNow: "Just now",
	readingTime: "{minutes:number} min",

	// Editor toolbar
	formatToolbarLabel: "Formatting",
	fmtBold: "Bold",
	fmtItalic: "Italic",
	fmtHeading1: "Heading 1",
	fmtHeading2: "Heading 2",
	fmtHeading3: "Heading 3",
	fmtBlockquote: "Blockquote",
	fmtBulletList: "Bullet list",
	fmtCode: "Inline code",

	// Inspector
	statistics: "Statistics",
	outline: "Outline",
	notes: "Notes",
	notesPlaceholder: "Jot down ideas, reminders...",
	words: "Words",
	characters: "Characters",
	paragraphs: "Paragraphs",
	readingTimeLabel: "Reading Time",

	// Statusbar
	wordCount: "{count:number} words",
	wordCountOf: "{count:string} / {total:string} words",
	sessionWords: "{count:string} session",
	charCount: "{count:number} chars",
	readTimeStatus: "{time:string} read",
	goalProgress: "{current:string} / {goal:string}",
	saveStateSaved: "Saved",
	saveStateSavedAt: "Saved {time:string}",
	saveStateSaving: "Saving…",
	saveStateError: "Error",

	// Command palette
	commandPlaceholder: "Type a command...",
	cmdNewDocument: "New Document",
	cmdToggleSidebar: "Toggle Sidebar",
	cmdToggleInspector: "Toggle Inspector",
	cmdToggleFocusMode: "Toggle Focus Mode",
	cmdToggleTheme: "Toggle Theme",
	catDocument: "Document",
	catView: "View",

	// Theme toggle
	toggleThemeLabel: "Toggle theme",

	// Start screen
	welcomeTitle: "Welcome to Sietch",
	welcomeSubtitle: "Your desert writing refuge",
	createProject: "Create Project",
	openProject: "Open Project",
	projectNameLabel: "Project name",
	projectNamePlaceholder: "My Novel",
	create: "Create",
	cancel: "Cancel",
	errorNotProject: "This folder is not a Sietch project",
	recentProjects: "Recent projects",
	removeFromRecents: "Remove from recents",

	// Dialogs
	saveFailedCloseAnyway:
		"Your latest changes could not be saved. Close anyway and lose them?",
} satisfies BaseTranslation;

export default en;
