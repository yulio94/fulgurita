import Fuse from "fuse.js";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { openChapter } from "../../services/chapters";
import { formatShortcut } from "../../services/platform";
import { findParentId } from "../../services/tree";
import type { CommandItem } from "../../types";
import styles from "./command-palette.module.css";

let overlay: HTMLElement | null = null;

function getCommands(): CommandItem[] {
	const LL = getLL();
	const trash = store.get("sidebarView") === "trash";
	return [
		{
			id: "new-doc",
			category: LL.catDocument(),
			label: LL.cmdNewDocument(),
			shortcut: "Mod+N",
			action: () => bus.emit("document:new"),
		},
		{
			id: "open-chapter",
			category: LL.catDocument(),
			label: LL.cmdOpenChapter(),
			shortcut: "Mod+P",
			action: () => bus.emit("palette:open-docs"),
		},
		{
			id: "save",
			category: LL.catDocument(),
			label: LL.cmdSave(),
			shortcut: "Mod+S",
			action: () => bus.emit("document:save"),
		},
		{
			id: "toggle-sidebar",
			category: LL.catView(),
			label: LL.cmdToggleSidebar(),
			shortcut: "Mod+\\",
			action: () => bus.emit("panel:toggle-sidebar"),
		},
		{
			id: "toggle-inspector",
			category: LL.catView(),
			label: LL.cmdToggleInspector(),
			shortcut: "Mod+Shift+I",
			action: () => bus.emit("panel:toggle-inspector"),
		},
		{
			id: "toggle-focus",
			category: LL.catView(),
			label: LL.cmdToggleFocusMode(),
			shortcut: "Mod+Shift+F",
			action: () => bus.emit("focus:toggle"),
		},
		{
			id: "toggle-theme",
			category: LL.catView(),
			label: LL.cmdToggleTheme(),
			action: () => bus.emit("theme:toggle"),
		},
		{
			id: "toggle-trash",
			category: LL.catView(),
			// One row that swaps, rather than two that are wrong half the time.
			// The commands are rebuilt on every open, so the label is never stale.
			label: trash ? LL.showManuscript() : LL.showTrash(),
			action: () => store.set("sidebarView", trash ? "manuscript" : "trash"),
		},
		{
			id: "settings",
			category: LL.catProject(),
			label: LL.cmdSettings(),
			// Bound by the OS menu item, not shortcuts.ts — the accelerator
			// belongs to the menu, so there is nothing here to register.
			shortcut: "Mod+,",
			action: () => bus.emit("settings:open"),
		},
	];
}

/**
 * The open chapters, as palette rows. `documents` is flat and holds chapters
 * only — folders live in `projectMeta.tree` — so it is already the list to show.
 */
function getDocCommands(): CommandItem[] {
	const LL = getLL();
	const tree = store.get("projectMeta")?.tree ?? [];
	return store.get("documents").map((doc) => ({
		id: doc.id,
		category: LL.catDocument(),
		label: doc.title,
		action: () => {
			// Same three steps as clicking the row in the sidebar
			store.set("selectedFolder", findParentId(tree, doc.id));
			bus.emit("document:save");
			void openChapter(doc);
		},
	}));
}

function close() {
	if (overlay) {
		overlay.remove();
		overlay = null;
	}
}

function renderResults(
	resultsEl: HTMLElement,
	items: CommandItem[],
	selectedIndex: number,
) {
	resultsEl.textContent = "";
	items.forEach((cmd, i) => {
		const item = document.createElement("div");
		item.className = i === selectedIndex ? styles.itemSelected : styles.item;

		const left = document.createElement("div");
		left.className = styles.itemLeft;

		const cat = document.createElement("span");
		cat.className = styles.category;
		cat.textContent = cmd.category;

		const label = document.createElement("span");
		label.className = styles.label;
		label.textContent = cmd.label;

		left.appendChild(cat);
		left.appendChild(label);
		item.appendChild(left);

		if (cmd.shortcut) {
			const shortcut = document.createElement("span");
			shortcut.className = styles.shortcut;
			shortcut.textContent = "";
			for (const key of formatShortcut(cmd.shortcut)) {
				const kbd = document.createElement("kbd");
				kbd.textContent = key;
				shortcut.appendChild(kbd);
			}
			item.appendChild(shortcut);
		}

		item.addEventListener("click", () => {
			close();
			cmd.action();
		});

		resultsEl.appendChild(item);
	});
}

function open(commands: CommandItem[], placeholder: string) {
	if (overlay) return;

	const fuse = new Fuse(commands, {
		keys: ["label", "category"],
		threshold: 0.4,
	});

	overlay = document.createElement("div");
	overlay.className = styles.overlay;

	const palette = document.createElement("div");
	palette.className = styles.palette;

	const input = document.createElement("input");
	input.className = styles.input;
	input.placeholder = placeholder;
	input.type = "text";

	const results = document.createElement("div");
	results.className = styles.results;

	palette.appendChild(input);
	palette.appendChild(results);
	overlay.appendChild(palette);
	document.body.appendChild(overlay);

	let selectedIndex = 0;
	let filtered = commands;

	renderResults(results, filtered, selectedIndex);
	input.focus();

	input.addEventListener("input", () => {
		const query = input.value.trim();
		filtered = query ? fuse.search(query).map((r) => r.item) : commands;
		selectedIndex = 0;
		renderResults(results, filtered, selectedIndex);
	});

	input.addEventListener("keydown", (e) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
			renderResults(results, filtered, selectedIndex);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
			renderResults(results, filtered, selectedIndex);
		} else if (e.key === "Enter" && filtered[selectedIndex]) {
			e.preventDefault();
			close();
			filtered[selectedIndex].action();
		} else if (e.key === "Escape") {
			e.preventDefault();
			close();
		}
	});

	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) close();
	});
}

export function createCommandPalette() {
	// Both lists are rebuilt per open: the labels are translated, and the chapter
	// list changes as the project does.
	bus.on("palette:open", () =>
		open(getCommands(), getLL().commandPlaceholder()),
	);
	bus.on("palette:open-docs", () =>
		open(getDocCommands(), getLL().chapterPlaceholder()),
	);
	bus.on("palette:close", close);
}
