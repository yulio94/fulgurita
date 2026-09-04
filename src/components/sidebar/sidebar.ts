import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { commitRename, openChapter } from "../../services/chapters";
import { getCollapsed, setCollapsed } from "../../services/config";
import { deleteFolder, renameFolder } from "../../services/invoke";
import { removeNode, renameFolderNode, updateTree } from "../../services/tree";
import type { Doc, FolderNode, TreeNode } from "../../types";
import styles from "./sidebar.module.css";

export function createSidebar(container: HTMLElement) {
	const LL = getLL();

	// Render
	container.innerHTML = `
    <div class="${styles.sidebar}">
      <div class="${styles.header}">
        <h2 class="${styles.headerTitle}">${LL.library()}</h2>
        <div class="${styles.headerActions}">
          <button class="${styles.btnNew}" id="btn-new-folder" aria-label="${LL.newFolder()}" title="${LL.newFolder()}">&#8862;</button>
          <button class="${styles.btnNew}" id="btn-new" aria-label="${LL.newChapterLabel()}" title="${LL.newChapterLabel()}">${LL.newDocument()}</button>
        </div>
      </div>
      <div class="${styles.projectTitle}" id="project-title"></div>
      <div class="${styles.docList}" id="doc-list"></div>
    </div>
  `;

	// Set user-controlled project name safely (textContent, not innerHTML)
	const initTitle = container.querySelector("#project-title");
	if (initTitle) {
		initTitle.textContent = store.get("projectMeta")?.name ?? LL.projectTitle();
	}

	// New document and new folder buttons
	container.querySelector("#btn-new")?.addEventListener("click", () => {
		bus.emit("document:new");
	});
	container.querySelector("#btn-new-folder")?.addEventListener("click", () => {
		bus.emit("folder:new");
	});

	// Reactive render. The tree lives on projectMeta, the row contents on
	// documents, and both the active chapter and the selected folder are drawn.
	store.on("documents", () => rerender());
	store.on("activeDoc", () => rerender());
	store.on("selectedFolder", () => rerender());
	store.on("projectMeta", (meta) => {
		const titleEl = container.querySelector("#project-title");
		if (titleEl) {
			titleEl.textContent = meta?.name ?? LL.projectTitle();
		}
		rerender();
	});

	// Which row is being renamed. Held here rather than by swapping the DOM node:
	// the first click of a double-click already starts openChapter, whose await
	// re-renders the list a moment later and would destroy a swapped-in input.
	let renamingId: string | null = null;

	// Folders are open until told otherwise, so this holds the closed ones and
	// the usual project persists an empty list.
	let collapsed = new Set<string>();

	const projectPath = store.get("projectPath");
	if (projectPath) {
		void getCollapsed(projectPath).then((ids) => {
			collapsed = new Set(ids);
			rerender();
		});
	}

	// Chapters are loaded after this mounts, so the first paint is usually empty.
	// Rendering here anyway keeps the sidebar from depending on that order.
	rerender();

	function toggleFolder(id: string) {
		if (!collapsed.delete(id)) collapsed.add(id);
		rerender();
		const path = store.get("projectPath");
		if (path) void setCollapsed(path, [...collapsed]);
	}

	function rerender() {
		const list = container.querySelector("#doc-list");
		if (!list) return;
		const docs = store.get("documents") ?? [];
		// No project meta means no tree: browser-only dev, and the tests. Falling
		// back to a flat list keeps the sidebar readable rather than empty.
		const tree: TreeNode[] =
			store.get("projectMeta")?.tree ??
			docs.map((doc) => ({ type: "item", id: doc.id, kind: "chapter" }));
		list.replaceChildren(...renderNodes(tree, docs, 0, null));
	}

	// Focus after the node is in the document, or focus() is a no-op
	function focusSoon(input: HTMLInputElement) {
		queueMicrotask(() => {
			input.focus();
			input.select();
		});
	}

	// ponytail: the input is rebuilt on every render, so a render mid-edit resets
	// the caret. Only openChapter re-renders during a rename, and that lands before
	// anyone has typed. Cache the node here if that stops being true.
	function renameInput(
		value: string,
		className: string,
		label: string,
		commit: (next: string) => Promise<"duplicate" | null>,
	): HTMLInputElement {
		const input = document.createElement("input");
		input.className = className;
		input.value = value;
		input.setAttribute("aria-label", label);

		// `change` covers Enter and blur-after-edit; blur alone restores the row
		input.addEventListener("change", () => {
			void commit(input.value).then((result) => {
				// Enter leaves the field focused, so a rejected name stays open to be
				// fixed. On a click-away the blur handler has already closed the row.
				if (result === "duplicate" && document.activeElement === input) {
					input.select();
					return;
				}
				renamingId = null;
				rerender();
			});
		});
		input.addEventListener("blur", () => {
			renamingId = null;
			rerender();
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				renamingId = null;
				rerender();
			}
		});
		// Clicking the field must not re-open the row underneath it
		input.addEventListener("click", (e) => e.stopPropagation());
		return input;
	}

	// The backend has already written the same change to sietch.json, so these
	// two follow the store rather than re-reading the file.
	async function commitFolderRename(
		folder: FolderNode,
		raw: string,
	): Promise<"duplicate" | null> {
		const path = store.get("projectPath");
		const title = raw.trim();
		if (!path || !title || title === folder.title) return null;

		// Two folders may share a name: the nesting already tells them apart,
		// where two chapters of the same name are two identical sidebar rows.
		const stored = await renameFolder(path, folder.id, title);
		updateTree((tree) => renameFolderNode(tree, folder.id, stored));
		return null;
	}

	async function removeFolder(id: string) {
		const path = store.get("projectPath");
		if (!path) return;
		try {
			await deleteFolder(path, id);
		} catch (err) {
			// The button only shows on an empty folder, so this is a lost race
			console.error(err);
			return;
		}
		updateTree((tree) => removeNode(tree, id));
		if (store.get("selectedFolder") === id) store.set("selectedFolder", null);
	}

	// Rows are a flat list, indented by depth. Nesting them in real containers
	// would buy nothing until something has to be dragged between them (F-022).
	function renderNodes(
		nodes: TreeNode[],
		docs: Doc[],
		depth: number,
		parentId: string | null,
	): HTMLElement[] {
		const rows: HTMLElement[] = [];
		for (const node of nodes) {
			if (node.type === "folder") {
				rows.push(folderRow(node, depth));
				if (!collapsed.has(node.id)) {
					rows.push(...renderNodes(node.children, docs, depth + 1, node.id));
				}
				continue;
			}
			const doc = docs.find((d) => d.id === node.id);
			// An id whose chapter did not load has nothing to draw
			if (doc) rows.push(docRow(doc, depth, parentId));
		}
		return rows;
	}

	function folderRow(folder: FolderNode, depth: number): HTMLElement {
		const item = document.createElement("div");
		item.className =
			store.get("selectedFolder") === folder.id
				? styles.folderItemSelected
				: styles.folderItem;
		item.style.setProperty("--depth", String(depth));

		const open = !collapsed.has(folder.id);
		const toggle = document.createElement("button");
		toggle.type = "button";
		toggle.className = styles.folderToggle;
		toggle.textContent = open ? "▾" : "▸";
		toggle.setAttribute("aria-expanded", String(open));
		toggle.setAttribute(
			"aria-label",
			open ? LL.collapseFolder() : LL.expandFolder(),
		);
		toggle.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleFolder(folder.id);
		});

		const editing = renamingId === folder.id;
		let title: HTMLElement;
		if (editing) {
			title = renameInput(
				folder.title,
				styles.folderTitleEdit,
				LL.folderTitleLabel(),
				(next) => commitFolderRename(folder, next),
			);
		} else {
			title = document.createElement("div");
			title.className = styles.folderTitle;
			title.textContent = folder.title;
			title.addEventListener("dblclick", () => {
				renamingId = folder.id;
				rerender();
			});
		}

		item.append(toggle, title);

		// A folder owns no file, so an empty one can go without touching trash/.
		// One with chapters in it waits for F-020 to decide what that means.
		if (folder.children.length === 0) {
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = styles.folderDelete;
			remove.textContent = "×";
			remove.setAttribute("aria-label", LL.deleteFolder());
			remove.addEventListener("click", (e) => {
				e.stopPropagation();
				void removeFolder(folder.id);
			});
			item.append(remove);
		}

		item.addEventListener("click", () => {
			if (renamingId === folder.id) return;
			// Selecting is what sends the next new chapter in here, so clicking the
			// selected folder again has to let go of it
			const selected = store.get("selectedFolder");
			store.set("selectedFolder", selected === folder.id ? null : folder.id);
		});
		if (editing) focusSoon(title as HTMLInputElement);
		return item;
	}

	function docRow(
		doc: Doc,
		depth: number,
		parentId: string | null,
	): HTMLElement {
		const item = document.createElement("div");
		item.className =
			doc.id === store.get("activeDoc")?.id
				? styles.docItemActive
				: styles.docItem;
		item.style.setProperty("--depth", String(depth));

		const editing = doc.id === renamingId;
		let title: HTMLElement;
		if (editing) {
			title = renameInput(
				doc.title,
				styles.docTitleEdit,
				LL.chapterTitleLabel(),
				(next) => commitRename(doc, next),
			);
		} else {
			title = document.createElement("div");
			title.className = styles.docTitle;
			title.textContent = doc.title;
			title.addEventListener("dblclick", () => {
				renamingId = doc.id;
				rerender();
			});
		}

		const preview = document.createElement("div");
		preview.className = styles.docPreview;
		preview.textContent = doc.preview;

		const meta = document.createElement("div");
		meta.className = styles.docMeta;
		meta.textContent = doc.meta;

		item.append(title, preview, meta);
		item.addEventListener("click", () => {
			if (renamingId === doc.id) return;
			// The next new chapter lands beside the one being read
			store.set("selectedFolder", parentId);
			// Flush the chapter being left before reading the next one
			bus.emit("document:save");
			void openChapter(doc);
		});
		if (editing) focusSoon(title as HTMLInputElement);
		return item;
	}
}
