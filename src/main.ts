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
import { openChapter, toDoc } from "./services/chapters";
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
	createEditor(editorEl);
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
	const chapter = await createChapter(projectPath, getLL().untitled());
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

	// Theme toggle lives on document.body — visible on all screens
	createThemeToggle();

	// Show start screen — editor mounts only after a project is loaded
	createStartScreen(root);

	bus.on("project:loaded", () => {
		mountEditorLayout(root, config);
	});
}

bootstrap();
