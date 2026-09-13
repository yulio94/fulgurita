import type { BaseTranslation } from "../i18n-types.js";

const en = {
	// Sidebar
	library: "Library",
	view: "View",
	newChapterLabel: "New chapter",
	newFolder: "New folder",
	folder: "Folder",
	folderTitleLabel: "Folder title",
	deleteFolder: "Delete folder",
	rename: "Rename",
	deleteChapter: "Delete chapter",
	expandFolder: "Expand",
	collapseFolder: "Collapse",
	treeMoved:
		"Moved {title:string} to {position:number} of {total:number} in {parent:string}",
	topLevel: "the top level",
	deleteFolderConfirm:
		"Delete {title:string} and the {count:number} chapters inside it? They move to the project's trash folder.",
	chapterTrashed: "Moved {title:string} to the trash",
	folderTrashed:
		"Deleted {title:string} and moved {count:number} chapters to the trash",
	projectTitle: "Untitled Project",
	viewEmpty: "Nothing here",

	// Trash
	trash: "Trash",
	restore: "Restore",
	deletedAgo: "Deleted {when:string}",
	inTheTrash: "In the trash",
	chapterRestored: "Restored {title:string} to the top level",

	// Editor
	placeholder: "Begin writing...",
	untitled: "Untitled",
	chapterEyebrow: "Chapter {n:number}",
	chapterTitleLabel: "Chapter title",
	justNow: "Just now",
	readingTime: "{minutes:number} min",
	changedOnDisk: "This document changed outside Fulgurita.",
	reloadFromDisk: "Reload",
	keepMine: "Keep mine",

	// Editor toolbar
	formatToolbarLabel: "Formatting",
	fmtBold: "Bold",
	fmtItalic: "Italic",
	fmtBlockquote: "Blockquote",
	fmtBulletList: "Bullet list",
	fmtCode: "Inline code",

	// Paragraph styles
	styleDropdownLabel: "Paragraph style",
	styleGroupStructure: "Structure",
	styleGroupSemantic: "Styles",
	styleNoStyle: "No Style",
	styleTitle: "Title",
	styleHeading1: "Heading 1",
	styleHeading2: "Heading 2",
	styleHeading3: "Heading 3",
	styleBlockQuote: "Block Quote",
	styleCodeBlock: "Code Block",
	styleAttribution: "Attribution",
	styleCaption: "Caption",
	styleVerse: "Verse",
	styleCentered: "Centered Text",

	// Inspector
	synopsis: "Synopsis",
	synopsisPlaceholder: "What happens in this chapter?",
	statistics: "Statistics",
	outline: "Outline",
	notes: "Notes",
	notesPlaceholder: "Jot down ideas, reminders...",
	words: "Words",
	characters: "Characters",
	paragraphs: "Paragraphs",
	readingTimeLabel: "Reading Time",

	// Inspector — tags
	tags: "Tags",
	addTag: "Add a tag",
	addTagPlaceholder: "POV, subplot, timeline…",
	removeTag: "Remove {tag:string}",
	tagColorLabel: "Color of {tag:string}",
	tagColorDefault: "Default",
	tagColorClay: "Clay",
	tagColorOlive: "Olive",
	tagColorWater: "Water",
	tagColorPlum: "Plum",
	tagColorEmber: "Ember",
	tagColorSky: "Sky",

	// Statusbar
	wordCount: "{count:number} words",
	wordCountOf: "{count:string} / {total:string} words",
	pageCount: "~{count:string} {{pages:page|pages}}",
	pageEstimateHint:
		"Estimate: ~{trade:string} pages in 6×9, ~{manuscript:string} in manuscript format.",
	sessionWords: "{count:string} session",
	readTimeStatus: "{time:string} read",
	goalProgress: "{current:string} / {goal:string}",
	saveStateSaved: "Saved",
	saveStateSavedAt: "Saved {time:string}",
	saveStateSaving: "Saving…",
	saveStateError: "Error",

	// Command palette
	commandPlaceholder: "Type a command...",
	chapterPlaceholder: "Go to chapter...",
	cmdNewDocument: "New Document",
	cmdOpenChapter: "Open Chapter…",
	cmdSave: "Save",
	cmdToggleSidebar: "Toggle Sidebar",
	cmdToggleInspector: "Toggle Inspector",
	cmdToggleFocusMode: "Toggle Focus Mode",
	cmdToggleTheme: "Toggle Theme",
	cmdSettings: "Settings…",
	catDocument: "Document",
	catView: "View",
	catProject: "Project",

	// Titlebar
	toggleThemeLabel: "Toggle theme",
	themeDay: "Light",
	themeNight: "Dark",
	focusModeLabel: "Focus Mode",

	// Start screen
	welcomeTitle: "Welcome to Fulgurita",
	welcomeSubtitle: "A quiet place to write.",
	createProject: "Create Project",
	openProject: "Open Project",
	projectNameLabel: "Project name",
	projectNamePlaceholder: "My Novel",
	create: "Create",
	cancel: "Cancel",

	// Settings
	settingsTitle: "Settings",
	settingsSectionProject: "Project",
	settingsSectionApp: "Application",
	projectLanguageLabel: "Project language",
	projectLanguageHint:
		"Applies to new documents. A file's own frontmatter always wins.",
	projectTypeLabel: "Project type",
	projectTypeHint:
		"What kind of writing this project holds. New documents and export keep their own settings for now.",
	projectTypeNovel: "Novel",
	projectTypeLongform: "Longform",
	projectTypeThesis: "Thesis",
	projectTypeBlog: "Blog",
	themeLabel: "Appearance",
	themeSystem: "System",
	themeHint: "System follows your computer's light and dark setting.",
	dailyGoalLabel: "Daily word goal",
	dailyGoalHint:
		"Measured against what you have written since opening the project.",
	typewriterLabel: "Typewriter scrolling",
	typewriterOff: "Off",
	typewriterInFocus: "In focus mode",
	typewriterHint:
		"Keeps the line you are writing near the middle of the window.",
	appLanguageLabel: "Interface language",
	appLanguageHint: "Applies the next time Fulgurita starts.",
	appLanguageRestart:
		"Restart Fulgurita to see the interface in this language.",
	restartPrompt: "Restart Fulgurita now to apply the new interface language?",
	restartNow: "Restart now",
	restartLater: "Later",
	done: "Done",
	errorNotProject: "This folder is not a Fulgurita project",
	recentProjects: "Recent projects",
	removeFromRecents: "Remove from recents",

	// Dialogs
	saveFailedCloseAnyway:
		"Your latest changes could not be saved. Close anyway and lose them?",
	saveFailedRestartAnyway:
		"Your latest changes could not be saved. Restart anyway and lose them?",
} satisfies BaseTranslation;

export default en;
