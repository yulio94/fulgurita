import { confirm } from "@tauri-apps/plugin-dialog";
import { createCommandPalette } from "./components/command-palette/command-palette";
import { createEditor } from "./components/editor/editor";
import { createInspector } from "./components/inspector/inspector";
import { createSettings } from "./components/settings/settings";
import { createSidebar } from "./components/sidebar/sidebar";
import { createStartScreen } from "./components/start-screen/start-screen";
import { createStatusbar } from "./components/statusbar/statusbar";
import { createTitlebar } from "./components/titlebar/titlebar";
import { bus } from "./core/bus";
import { store } from "./core/store";
import { getLL, initI18n, resolveLocale } from "./i18n";
import {
	nextAfterDelete,
	nextUntitledTitle,
	openChapter,
	toDoc,
} from "./services/chapters";
import { loadConfig } from "./services/config";
import {
	createChapter,
	createFolder,
	deleteChapter,
	deleteFolder,
	listChapters,
	restoreChapter,
} from "./services/invoke";
import { loadTrash } from "./services/providers";
import { initShortcuts } from "./services/shortcuts";
import { initSplitPanels } from "./services/split-panels";
import {
	findNode,
	insertNode,
	itemIds,
	removeNode,
	updateTree,
} from "./services/tree";
import type { ChapterMeta, TreeNode } from "./types";

function buildLayout(): HTMLElement {
	const app = document.createElement("div");
	app.className = "app";

	// Row one, across every column. The window's chrome, so it sits above the
	// panels rather than inside any of them.
	const titlebarSlot = document.createElement("div");
	titlebarSlot.id = "slot-titlebar";
	titlebarSlot.style.gridColumn = "1 / -1";

	const sidebarSlot = document.createElement("div");
	sidebarSlot.id = "slot-sidebar";

	const divider1 = document.createElement("div");
	divider1.className = "divider";

	const editorSlot = document.createElement("div");
	editorSlot.id = "slot-editor";
	editorSlot.style.display = "flex";
	editorSlot.style.flexDirection = "column";
	editorSlot.style.overflow = "hidden";

	const divider2 = document.createElement("div");
	divider2.className = "divider";

	const inspectorSlot = document.createElement("div");
	inspectorSlot.id = "slot-inspector";

	// Row two, across every column. Under the editor alone the bar had ~320px
	// for labels that want twice that, and they wrapped out of its 28px.
	const statusbarSlot = document.createElement("div");
	statusbarSlot.id = "slot-statusbar";
	statusbarSlot.style.gridColumn = "1 / -1";

	app.appendChild(titlebarSlot);
	app.appendChild(sidebarSlot);
	app.appendChild(divider1);
	app.appendChild(editorSlot);
	app.appendChild(divider2);
	app.appendChild(inspectorSlot);
	app.appendChild(statusbarSlot);

	return app;
}

async function detectSystemLocale(): Promise<string> {
	try {
		const { locale } = await import("@tauri-apps/plugin-os");
		const sysLocale = await locale();
		if (sysLocale) return sysLocale;
	} catch {
		// Not running in Tauri (e.g. browser-only dev) — fall back
	}
	return navigator.language;
}

// Set when the editor mounts. The start screen has nothing to flush, but the hook
// below is registered from there anyway, so it covers every way out from the moment
// the app opens rather than only after a project is loaded.
let flushEditor: () => Promise<void> = async () => {};

// Leaving inside the autosave debounce would drop the last edits, so the way out
// waits for the write. Tauri closes the window from the Rust side and never fires
// `beforeunload`, so this hooks the window event instead. Cmd+Q arrives here too:
// Rust remaps it to a window close for exactly this reason.
//
// Registering this hands window closing over to JS — Rust calls prevent_close() as
// soon as a listener exists, and the API destroys the window itself once the handler
// returns. That needs `core:window:allow-destroy` in capabilities/default.json;
// `core:default` omits it, and the window would never close again.
async function flushBeforeExit(flush: () => Promise<void>) {
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");

		await getCurrentWindow().onCloseRequested(async (event) => {
			await flush();
			if (store.get("saveState") !== "error") return;
			// A save that still fails on the way out is the user's call: refusing
			// outright would trap them here when the disk is genuinely full. `confirm`
			// needs no permission of its own — it goes through `plugin:dialog|message`,
			// which `dialog:default` already allows.
			if (!(await confirm(getLL().saveFailedCloseAnyway()))) {
				event.preventDefault();
			}
		});
	} catch {
		// Not running in Tauri (e.g. browser-only dev) — nothing to hook
	}
}

// The system menu owns Settings and its Cmd+, (Ctrl+, off macOS) — the
// accelerator lives on the menu item, so there is nothing for shortcuts.ts to
// bind. Rust forwards the click; this turns it into the bus event the modal
// already listens for.
async function listenForSettingsMenu() {
	try {
		const { listen } = await import("@tauri-apps/api/event");
		await listen("settings:open", () => bus.emit("settings:open"));
	} catch {
		// Not running in Tauri (e.g. browser-only dev) — nothing to hook
	}
}

// Restarting is how an interface-language change takes effect. relaunch() tears
// the process down directly — it never reaches onCloseRequested, so the flush
// that hook exists for has to run here instead, or the last edits inside the
// autosave debounce go with it.
async function restartApp() {
	await flushEditor();
	// A failed save is the one case where restarting costs work, so it asks the
	// same way closing does. Declining just leaves the app running: the language
	// is already persisted and the next launch applies it anyway.
	if (
		store.get("saveState") === "error" &&
		!(await confirm(getLL().saveFailedRestartAnyway()))
	) {
		return;
	}
	try {
		const { relaunch } = await import("@tauri-apps/plugin-process");
		await relaunch();
	} catch {
		// Not running in Tauri (e.g. browser-only dev) — nothing to relaunch
	}
}

function mountEditorLayout(
	root: HTMLElement,
	config: Awaited<ReturnType<typeof loadConfig>>,
) {
	const app = buildLayout();

	// Clear the start screen safely using DOM API
	while (root.firstChild) {
		root.removeChild(root.firstChild);
	}
	root.appendChild(app);

	// Mount components into slots
	const sidebarEl = app.querySelector("#slot-sidebar") as HTMLElement;
	const editorEl = app.querySelector("#slot-editor") as HTMLElement;
	const inspectorEl = app.querySelector("#slot-inspector") as HTMLElement;
	createTitlebar(app.querySelector("#slot-titlebar") as HTMLElement);
	createSidebar(sidebarEl);
	({ flush: flushEditor } = createEditor(editorEl));
	createInspector(inspectorEl);
	createStatusbar(app.querySelector("#slot-statusbar") as HTMLElement);
	createCommandPalette();

	// Init services
	initShortcuts();
	initSplitPanels(app, config.sidebarWidth, config.inspectorWidth);

	// Load chapters from disk
	void loadChapters();

	// Handle new document and folder creation
	bus.on("document:new", () => {
		void addChapter();
	});
	bus.on("folder:new", () => {
		void addFolder();
	});

	// Both deletes live here rather than in the sidebar: they need the editor's
	// flush, and this is the only place holding it.
	bus.on("document:delete", (id) => {
		void removeChapter(id);
	});
	bus.on("folder:delete", (id) => {
		void removeFolder(id);
	});
	bus.on("document:restore", (id) => {
		void restoreDocument(id);
	});
}

/**
 * Brings a chapter back from `trash/`. No flush and no confirmation: nothing is
 * leaving `chapters/`, and putting a chapter back takes nothing away.
 *
 * Here rather than in the sidebar for the same reason the deletes are: this file
 * owns the chapter list, and a restore adds to it.
 */
async function restoreDocument(id: string) {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	let chapter: ChapterMeta;
	try {
		chapter = await restoreChapter(projectPath, id);
	} catch (err) {
		// Nothing moved and nothing was written — the row is still in the trash
		console.error(err);
		return;
	}

	// Mirrors what restore_chapter wrote: the file is back and the node is at the
	// root of the tree. The store follows it rather than re-reading sietch.json.
	store.set("documents", [...store.get("documents"), toDoc(chapter)]);
	updateTree((tree) =>
		insertNode(tree, { type: "item", id, kind: "chapter" }, null),
	);
	void loadTrash();
	bus.emit("tree:announce", getLL().chapterRestored({ title: chapter.title }));
}

/**
 * Moves a chapter to `trash/`. No confirmation — the file is recoverable, and a
 * modal over a reversible move is friction.
 */
async function removeChapter(id: string) {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	const doc = store.get("documents").find((d) => d.id === id);
	// Write the chapter before it moves. The 2s autosave would otherwise fire at
	// a file that is no longer under chapters/, and `save_chapter` reads before
	// it writes, so the write fails and the statusbar goes red over nothing. It
	// also means the last sentence typed goes into trash/ with the rest.
	if (store.get("activeDoc")?.id === id) await flushEditor();

	try {
		await deleteChapter(projectPath, id);
	} catch (err) {
		console.error(err);
		return;
	}

	updateTree((tree) => removeNode(tree, id));
	dropDocuments([id]);
	if (doc) {
		bus.emit("tree:announce", getLL().chapterTrashed({ title: doc.title }));
	}
}

/**
 * Deletes a folder, taking every chapter under it to `trash/`. This is the one
 * delete that asks first: it takes more than the row that was clicked.
 */
async function removeFolder(id: string) {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	const folder = findNode(store.get("projectMeta")?.tree ?? [], id);
	if (folder?.type !== "folder") return;

	const doomed = itemIds(folder);
	if (
		doomed.length > 0 &&
		!(await confirm(
			getLL().deleteFolderConfirm({
				title: folder.title,
				count: doomed.length,
			}),
		))
	) {
		return;
	}

	// Same reason as removeChapter, one level up: the open chapter may be inside
	if (doomed.includes(store.get("activeDoc")?.id ?? "")) await flushEditor();

	try {
		await deleteFolder(projectPath, id);
	} catch (err) {
		console.error(err);
		return;
	}

	// One remove takes the folder and everything under it
	updateTree((tree) => removeNode(tree, id));
	if (store.get("selectedFolder") === id) store.set("selectedFolder", null);
	dropDocuments(doomed);
	bus.emit(
		"tree:announce",
		getLL().folderTrashed({ title: folder.title, count: doomed.length }),
	);
}

/**
 * Drops deleted chapters from the store and settles what is left on screen.
 *
 * A project never opens onto a dead end — `loadChapters` makes a chapter when it
 * finds none — so deleting the last one has to hold the same line rather than
 * leaving an empty editor until the next open.
 */
function dropDocuments(ids: string[]) {
	const gone = new Set(ids);
	const before = store.get("documents");
	const left = before.filter((doc) => !gone.has(doc.id));
	store.set("documents", left);

	const active = store.get("activeDoc");
	if (!active || !gone.has(active.id)) return;

	const next = nextAfterDelete(before, active.id, gone);
	// Nothing left to open. loadChapters makes a chapter when it finds none, so
	// deleting the last one holds the same line rather than leaving a blank
	// editor until the next time the project opens.
	if (!next) {
		void addChapter();
		return;
	}
	void openChapter(next);
}

// Reads the project's chapters and opens the first one. A project with no
// chapters gets one, so a fresh project never opens onto a dead end.
async function loadChapters() {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	let chapters = await listChapters(projectPath);
	if (chapters.length === 0) {
		const first = await createChapter(projectPath, getLL().untitled());
		updateTree((tree) =>
			insertNode(tree, { type: "item", id: first.id, kind: "chapter" }, null),
		);
		chapters = [first];
	}

	const docs = chapters.map((chapter) => toDoc(chapter));
	store.set("documents", docs);
	await openChapter(docs[0]);
}

// Adds a chapter to the selected folder, or to the root. The backend inserts it
// in the same place, so the sidebar mirrors the insert and the two stay in the
// same order.
async function addChapter() {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	bus.emit("document:save");
	const parent = store.get("selectedFolder");
	const title = nextUntitledTitle(
		store.get("documents").map((d) => d.title),
		getLL().untitled(),
	);
	const chapter = await createChapter(projectPath, title, parent);
	const doc = toDoc(chapter);
	updateTree((tree) =>
		insertNode(tree, { type: "item", id: chapter.id, kind: "chapter" }, parent),
	);
	store.set("documents", [...store.get("documents"), doc]);
	await openChapter(doc);
}

// Adds a folder and selects it, so the next new chapter lands inside it.
// Folder titles are not unique, but a stack of identical "Folder" rows is no
// more readable than a stack of identical chapters, so they take a suffix too.
async function addFolder() {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	const parent = store.get("selectedFolder");
	const title = nextUntitledTitle(folderTitles(), getLL().folder());
	const folder = await createFolder(projectPath, title, parent);
	updateTree((tree) => insertNode(tree, folder, parent));
	store.set("selectedFolder", folder.id);
}

function folderTitles(): string[] {
	const titles: string[] = [];
	const walk = (nodes: TreeNode[]) => {
		for (const node of nodes) {
			if (node.type !== "folder") continue;
			titles.push(node.title);
			walk(node.children);
		}
	};
	walk(store.get("projectMeta")?.tree ?? []);
	return titles;
}

/**
 * Owns the `.dark` class and the theme:toggle handler. Deliberately not part of
 * the titlebar: that only mounts with a project open, and the start screen needs
 * a theme too.
 */
function initTheme() {
	bus.on("theme:toggle", () => {
		store.set("theme", store.get("theme") === "light" ? "dark" : "light");
	});
	store.on(
		"theme",
		(theme) => {
			document.documentElement.classList.toggle("dark", theme === "dark");
			void syncWindowTheme(theme);
		},
		{ immediate: true },
	);
}

/**
 * Put the native window chrome on the same side as the CSS.
 *
 * The theme toggle is ours and the system appearance is the OS's, and macOS
 * draws the window title in the second one — so a dark app under a light system
 * left the title near-black on our dark panel. Windows draws its titlebar the
 * same way. Telling the window its theme is what macOS needs to flip the title
 * text, and it costs nothing on Linux, where the chrome is the WM's anyway.
 */
async function syncWindowTheme(theme: string) {
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().setTheme(theme === "dark" ? "dark" : "light");
	} catch {
		// Not running in Tauri (browser-only dev, tests) — no window to tell
	}
}

async function bootstrap() {
	const root = document.getElementById("app");
	if (!root) return;

	// Detect locale and init i18n before mounting any component
	const bcp47 = await detectSystemLocale();
	const systemLocale = resolveLocale(bcp47);
	initI18n(systemLocale);

	// Load persisted config (populates the reactive store)
	const config = await loadConfig();

	// If persisted locale differs from system locale, re-init i18n
	const appLocale = resolveLocale(config.locale);
	if (appLocale !== systemLocale) {
		initI18n(appLocale);
	}
	document.documentElement.lang = appLocale;

	// Registered before the start screen, so every exit path is covered from the start
	void flushBeforeExit(() => flushEditor());

	// The theme has to be applied before the start screen, which is mounted
	// long before the titlebar that carries the button.
	initTheme();

	// Settings holds app-wide state as well as the project's, so it is worth
	// opening with no project loaded. Mounted here rather than with the editor:
	// that is what makes the menu's Cmd+, do something on the start screen.
	createSettings();
	void listenForSettingsMenu();
	bus.on("app:restart", () => {
		void restartApp();
	});

	// Show start screen — editor mounts only after a project is loaded
	createStartScreen(root);

	bus.on("project:loaded", () => {
		mountEditorLayout(root, config);
	});
}

bootstrap();
