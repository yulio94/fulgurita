import { confirm } from "@tauri-apps/plugin-dialog";
import { createCommandPalette } from "./components/command-palette/command-palette";
import { createEditor } from "./components/editor/editor";
import { createInspector } from "./components/inspector/inspector";
import { createSidebar } from "./components/sidebar/sidebar";
import { createStartScreen } from "./components/start-screen/start-screen";
import { createStatusbar } from "./components/statusbar/statusbar";
import { createThemeToggle } from "./components/theme-toggle/theme-toggle";
import { bus } from "./core/bus";
import { store } from "./core/store";
import { getLL, initI18n, resolveLocale } from "./i18n";
import { nextUntitledTitle, openChapter, toDoc } from "./services/chapters";
import { loadConfig } from "./services/config";
import { createChapter, listChapters } from "./services/invoke";
import { initShortcuts } from "./services/shortcuts";
import { initSplitPanels } from "./services/split-panels";

function buildLayout(): HTMLElement {
	const app = document.createElement("div");
	app.className = "app";

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

	app.appendChild(sidebarSlot);
	app.appendChild(divider1);
	app.appendChild(editorSlot);
	app.appendChild(divider2);
	app.appendChild(inspectorSlot);

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
	createSidebar(sidebarEl);
	({ flush: flushEditor } = createEditor(editorEl));
	createInspector(inspectorEl);
	createStatusbar(editorEl);
	createCommandPalette();

	// Init services
	initShortcuts();
	initSplitPanels(app, config.sidebarWidth, config.inspectorWidth);

	// Load chapters from disk
	void loadChapters();

	// Handle new document creation
	bus.on("document:new", () => {
		void addChapter();
	});
}

// Reads the project's chapters and opens the first one. A project with no
// chapters gets one, so a fresh project never opens onto a dead end.
async function loadChapters() {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	let chapters = await listChapters(projectPath);
	if (chapters.length === 0) {
		chapters = [await createChapter(projectPath, getLL().untitled())];
	}

	const docs = chapters.map((chapter) => toDoc(chapter));
	store.set("documents", docs);
	await openChapter(docs[0]);
}

// Appends a chapter. The backend pushes to `chapter_order`, so the sidebar
// appends too and the two stay in the same order.
async function addChapter() {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;

	bus.emit("document:save");
	const title = nextUntitledTitle(
		store.get("documents").map((d) => d.title),
		getLL().untitled(),
	);
	const chapter = await createChapter(projectPath, title);
	const doc = toDoc(chapter);
	store.set("documents", [...store.get("documents"), doc]);
	await openChapter(doc);
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

	// Theme toggle lives on document.body — visible on all screens
	createThemeToggle();

	// Show start screen — editor mounts only after a project is loaded
	createStartScreen(root);

	bus.on("project:loaded", () => {
		mountEditorLayout(root, config);
	});
}

bootstrap();
