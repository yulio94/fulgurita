import type { BaseTranslation } from "../i18n-types.js";

const en = {
	// Sidebar
	library: "Library",
	newDocument: "+",
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
	charCount: "{count:number} chars",
	readTimeStatus: "{time:string} read",
	goalProgress: "{current:string} / {goal:string}",

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
} satisfies BaseTranslation;

export default en;
