import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { commitRename, openChapter } from "../../services/chapters";
import { getCollapsed, setCollapsed } from "../../services/config";
import {
	deleteFolder,
	moveNode as persistMove,
	renameFolder,
} from "../../services/invoke";
import {
	type Drop,
	type DropRow,
	keyboardTarget,
	type MoveDirection,
	type MoveTarget,
	resolveDrop,
} from "../../services/move-target";
import {
	manuscriptProvider,
	type ViewProvider,
} from "../../services/providers";
import {
	findNode,
	findParentId,
	moveNode,
	removeNode,
	renameFolderNode,
	updateTree,
} from "../../services/tree";
import type { Doc, FolderNode, TreeNode } from "../../types";
import styles from "./sidebar.module.css";

/** A row as it was rendered: the tree facts the DOM does not carry. */
interface RowMeta {
	id: string;
	type: TreeNode["type"];
	parentId: string | null;
	depth: number;
	el: HTMLElement;
}

export function createSidebar(
	container: HTMLElement,
	provider: ViewProvider = manuscriptProvider,
) {
	const LL = getLL();

	// The view being rendered. It lives here rather than in the provider, so the
	// selection and the collapsed folders survive a switch of views (F-073).
	let view = provider;

	// Render
	container.innerHTML = `
    <div class="${styles.sidebar}">
      <div class="${styles.header}">
        <h2 class="${styles.headerTitle}" id="view-title"></h2>
        <div class="${styles.headerActions}">
          <button class="${styles.btnNew}" id="btn-new-folder" aria-label="${LL.newFolder()}" title="${LL.newFolder()}">&#8862;</button>
          <button class="${styles.btnNew}" id="btn-new" aria-label="${LL.newChapterLabel()}" title="${LL.newChapterLabel()}">${LL.newDocument()}</button>
        </div>
      </div>
      <div class="${styles.projectTitle}" id="project-title"></div>
      <div class="${styles.docList}" id="doc-list"></div>
      <div class="${styles.liveRegion}" id="tree-live" role="status"></div>
    </div>
  `;

	// Set user-controlled project name safely (textContent, not innerHTML)
	const initTitle = container.querySelector("#project-title");
	if (initTitle) {
		initTitle.textContent = store.get("projectMeta")?.name ?? LL.projectTitle();
	}
	setViewTitle(provider);

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

	// What the last render drew, in order. A drag measures these; nothing else
	// knows a row's depth or its parent, and the DOM cannot be asked.
	let rows: RowMeta[] = [];

	// The row holding the list's single tab stop. Two hundred chapters must not
	// become two hundred stops between the sidebar and the editor.
	let focusedId: string | null = null;

	// Alt is the outliner's move modifier. Left and right are also history
	// back and forward in WebView2 and WebKitGTK, so every one of these is
	// preventDefault'd whether or not it turns out to have somewhere to go.
	const MOVES: Record<string, MoveDirection> = {
		ArrowUp: "up",
		ArrowDown: "down",
		ArrowLeft: "out",
		ArrowRight: "in",
	};

	/** Pixels of movement before a press becomes a drag rather than a click. */
	const THRESHOLD = 4;
	/** How close to an edge starts the list scrolling, and how fast. */
	const EDGE = 32;
	const SPEED = 12;

	let drag: {
		id: string;
		pointerId: number;
		startX: number;
		startY: number;
		x: number;
		y: number;
		active: boolean;
		measured: DropRow[];
		target: Drop | null;
	} | null = null;
	let pendingRerender = false;
	let scrolling = 0;
	let dropLine: HTMLElement | null = null;

	const projectPath = store.get("projectPath");
	if (projectPath) {
		void getCollapsed(projectPath).then((ids) => {
			collapsed = new Set(ids);
			rerender();
		});
	}

	const list = container.querySelector<HTMLElement>("#doc-list");
	if (list) {
		wireDrag(list);
		wireKeys(list);
	}

	// Chapters are loaded after this mounts, so the first paint is usually empty.
	// Rendering here anyway keeps the sidebar from depending on that order.
	rerender();

	return {
		/** Swaps the view. The selection and the collapsed folders stay put. */
		setProvider(next: ViewProvider) {
			view = next;
			setViewTitle(next);
			rerender();
		},
	};

	// A label is a translated string today, but it goes in as text like the
	// project name beside it rather than through the template.
	function setViewTitle(next: ViewProvider) {
		const el = container.querySelector("#view-title");
		if (el) el.textContent = next.label();
	}

	function toggleFolder(id: string) {
		if (!collapsed.delete(id)) collapsed.add(id);
		rerender();
		const path = store.get("projectPath");
		if (path) void setCollapsed(path, [...collapsed]);
	}

	function rerender() {
		// A rebuild mid-drag would detach every row we measured, drop the
		// indicator and — since capture is on the list, not a row — leave the
		// drag running against elements nothing can see. The editor's autosave
		// writes `documents` on a 2s debounce, so this is not a rare race.
		if (drag?.active) {
			pendingRerender = true;
			return;
		}
		const list = container.querySelector("#doc-list");
		if (!list) return;
		// Only put focus back if it was in here — a background render must not
		// take it off the editor.
		const held = list.contains(document.activeElement);
		rows = [];
		list.replaceChildren(...renderNodes(view.roots(), 0, null));
		rovingTabStop();
		// Not while renaming: the input focuses itself a microtask later.
		if (held && !renamingId) {
			rows
				.find((row) => row.id === focusedId)
				?.el.focus({ preventScroll: true });
		}
	}

	/** One tab stop on the list: the focused row, or the first one. */
	function rovingTabStop() {
		const stop = rows.some((row) => row.id === focusedId)
			? focusedId
			: (rows[0]?.id ?? null);
		for (const row of rows) row.el.tabIndex = row.id === stop ? 0 : -1;
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

	// --- Drag to reorder (F-022) ---
	//
	// Pointer events rather than HTML5 drag and drop: the window leaves Tauri's
	// `dragDropEnabled` on, so the webview's own file-drop handler eats drag
	// events, and the three engines disagree about the drag image, autoscroll
	// and dragover cadence. A drop here is also a position, not just a target,
	// which HTML5 DnD does not report.

	function wireDrag(list: HTMLElement) {
		list.addEventListener("pointerdown", (e) => {
			if (e.button !== 0 || !e.isPrimary) return;
			const from = e.target as HTMLElement;
			// The toggle, the delete button and an open rename field own their
			// own gestures
			if (from.closest("button, input")) return;
			const row = from.closest<HTMLElement>("[data-id]");
			const id = row?.dataset.id;
			if (!row || !id) return;

			// WebKit does not move focus to a div on a click, so without this the
			// keyboard would only ever reach the rows through Tab.
			focusedId = id;
			rovingTabStop();
			row.focus({ preventScroll: true });

			if (!canDrag()) return;
			// Touch needs `touch-action: none`, which would cost the sidebar its
			// scroll on a touchscreen laptop. The trade is not worth it here.
			if (e.pointerType === "touch") return;

			drag = {
				id,
				pointerId: e.pointerId,
				startX: e.clientX,
				startY: e.clientY,
				x: e.clientX,
				y: e.clientY,
				active: false,
				measured: [],
				target: null,
			};
		});

		list.addEventListener("pointermove", (e) => {
			if (!drag || e.pointerId !== drag.pointerId) return;
			drag.x = e.clientX;
			drag.y = e.clientY;
			if (!drag.active) {
				const moved = Math.hypot(
					e.clientX - drag.startX,
					e.clientY - drag.startY,
				);
				if (moved <= THRESHOLD || !begin(list)) return;
			}
			aim(list);
			autoscroll(list);
		});

		list.addEventListener("pointerup", (e) => {
			if (!drag || e.pointerId !== drag.pointerId) return;
			const { active, id, target } = drag;
			end(list);
			if (!active) return;
			// The press started on a row, so a click is still coming for the
			// handler that opens a chapter or selects a folder.
			swallowNextClick();
			if (target) void applyMove(id, target);
		});

		// A cancelled gesture, or capture taken away by the OS — GTK does this.
		const abandon = () => end(list);
		list.addEventListener("pointercancel", abandon);
		list.addEventListener("lostpointercapture", abandon);
	}

	function canDrag(): boolean {
		if (!view.reorderable) return false;
		// A rename owns the row while it is open
		if (renamingId) return false;
		// Browser-only dev and the tests have no backend to persist to
		return (
			Boolean(store.get("projectPath")) && Boolean(store.get("projectMeta"))
		);
	}

	/** Measures the rendered rows and commits to a drag. */
	function begin(list: HTMLElement): boolean {
		if (!drag) return false;
		const source = rows.find((row) => row.id === drag?.id);
		// A render between the press and the threshold can take the row away
		if (!source) return false;

		const bounds = list.getBoundingClientRect();
		drag.measured = rows.map((row) => {
			const rect = row.el.getBoundingClientRect();
			return {
				id: row.id,
				type: row.type,
				parentId: row.parentId,
				depth: row.depth,
				// Content coordinates, so autoscrolling does not invalidate them
				top: rect.top - bounds.top + list.scrollTop,
				height: rect.height,
			};
		});
		drag.active = true;
		// Taken here rather than on pointerdown: capture retargets the
		// compatibility mouse events too, so holding it through an ordinary
		// press sends the click to the list and the row never opens. The list
		// and not a row, because a row is replaced on every render and takes
		// the capture with it.
		list.setPointerCapture(drag.pointerId);
		list.classList.add(styles.dragging);
		source.el.classList.add(styles.dragSource);
		window.addEventListener("keydown", onEscape, true);
		return true;
	}

	/** Resolves the pointer to a drop and draws it. */
	function aim(list: HTMLElement) {
		if (!drag) return;
		const bounds = list.getBoundingClientRect();
		const indent = indentOf(list);
		drag.target = resolveDrop(
			drag.measured,
			drag.x - bounds.left,
			drag.y - bounds.top + list.scrollTop,
			indent,
			view.roots(),
			drag.id,
		);
		paint(list, drag.target, indent);
	}

	// happy-dom hands back "" for a custom property, and so does any engine that
	// has not laid the list out yet.
	function indentOf(list: HTMLElement): number {
		const raw = getComputedStyle(list).getPropertyValue("--indent");
		return Number.parseFloat(raw) || 16;
	}

	function paint(list: HTMLElement, target: Drop | null, indent: number) {
		for (const row of rows) row.el.classList.remove(styles.dropInto);
		if (!dropLine) {
			dropLine = document.createElement("div");
			dropLine.className = styles.dropLine;
			list.append(dropLine);
		}
		dropLine.hidden = true;
		if (!target) return;

		const row = drag?.measured.find((r) => r.id === target.indicator.rowId);
		if (!row) return;

		if (target.indicator.kind === "into") {
			rows.find((r) => r.id === row.id)?.el.classList.add(styles.dropInto);
			return;
		}
		const edge =
			target.indicator.kind === "before" ? row.top : row.top + row.height;
		dropLine.style.top = `${edge}px`;
		// Indented to the level it would land at, which is the only thing that
		// makes an ambiguous gap's answer visible before the button comes up.
		dropLine.style.left = `${8 + target.indicator.depth * indent}px`;
		dropLine.hidden = false;
	}

	function autoscroll(list: HTMLElement) {
		cancelAnimationFrame(scrolling);
		if (!drag) return;
		const bounds = list.getBoundingClientRect();
		const step =
			drag.y - bounds.top < EDGE
				? -SPEED
				: bounds.bottom - drag.y < EDGE
					? SPEED
					: 0;
		if (!step) return;
		const tick = () => {
			list.scrollTop += step;
			// Re-aim: the pointer has not moved, but the content under it has
			aim(list);
			scrolling = requestAnimationFrame(tick);
		};
		scrolling = requestAnimationFrame(tick);
	}

	function onEscape(e: KeyboardEvent) {
		if (e.key !== "Escape" || !drag) return;
		e.preventDefault();
		const el = container.querySelector<HTMLElement>("#doc-list");
		if (el) end(el);
	}

	/** Puts everything back, whether the drag ended in a drop or not. */
	function end(list: HTMLElement) {
		if (!drag) return;
		cancelAnimationFrame(scrolling);
		window.removeEventListener("keydown", onEscape, true);
		if (list.hasPointerCapture(drag.pointerId)) {
			list.releasePointerCapture(drag.pointerId);
		}
		list.classList.remove(styles.dragging);
		for (const row of rows) {
			row.el.classList.remove(styles.dragSource, styles.dropInto);
		}
		dropLine?.remove();
		dropLine = null;
		drag = null;

		// Anything the guard turned away while the drag was running
		if (pendingRerender) {
			pendingRerender = false;
			rerender();
		}
	}

	// The press that started the drag still owes a click, and the row's handler
	// would read it as "open this chapter".
	function swallowNextClick() {
		const eat = (e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			window.removeEventListener("click", eat, true);
		};
		window.addEventListener("click", eat, true);
		// A pointerup over nothing is followed by no click at all, and the
		// listener would go on to eat the next real one.
		setTimeout(() => window.removeEventListener("click", eat, true), 0);
	}

	async function applyMove(id: string, target: MoveTarget) {
		const path = store.get("projectPath");
		if (!path) return;
		try {
			await persistMove(path, id, target.parentId, target.beforeId);
		} catch (err) {
			// Nothing was written and the store never moved, so the row is
			// already back where it was
			console.error(err);
			return;
		}
		// Landing in a closed folder would otherwise look like a deletion
		if (target.parentId && collapsed.delete(target.parentId)) {
			void setCollapsed(path, [...collapsed]);
		}
		updateTree((tree) => moveNode(tree, id, target.parentId, target.beforeId));
		announce(id);
	}

	/**
	 * Says where the node ended up. A drag shows it, but a keyboard move has
	 * nothing to look at, and the row it moved may have scrolled away.
	 */
	function announce(id: string) {
		const tree = store.get("projectMeta")?.tree ?? [];
		const node = findNode(tree, id);
		if (!node) return;
		const parentId = findParentId(tree, id);
		const parent = parentId ? findNode(tree, parentId) : null;
		const siblings = parent?.type === "folder" ? parent.children : tree;

		const live = container.querySelector("#tree-live");
		if (!live) return;
		live.textContent = LL.treeMoved({
			title:
				node.type === "folder" ? node.title : (view.item(node)?.title ?? ""),
			position: siblings.findIndex((sibling) => sibling.id === id) + 1,
			total: siblings.length,
			parent: parent?.type === "folder" ? parent.title : LL.topLevel(),
		});
	}

	function wireKeys(list: HTMLElement) {
		list.addEventListener("focusin", (e) => {
			const row = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
			if (!row?.dataset.id) return;
			focusedId = row.dataset.id;
			rovingTabStop();
		});

		list.addEventListener("keydown", (e) => {
			if (!focusedId || renamingId) return;
			const direction = MOVES[e.key];
			if (!direction) return;

			if (!e.altKey) {
				// Bare arrows walk the rows; left and right are the folder's
				// own business, and it has none yet.
				if (direction !== "up" && direction !== "down") return;
				e.preventDefault();
				const index = rows.findIndex((row) => row.id === focusedId);
				rows[index + (direction === "down" ? 1 : -1)]?.el.focus();
				return;
			}

			e.preventDefault();
			if (!canDrag()) return;
			const target = keyboardTarget(view.roots(), focusedId, direction);
			if (target) void applyMove(focusedId, target);
		});
	}

	// Rows are a flat list, indented by depth. Nesting them in real containers
	// would buy nothing: a drag reads its targets off `rows`, which renderNodes
	// fills in as it goes, and which carries the depth and parent the DOM does
	// not have. That side list is also the answer to a node whose document did
	// not load — it is what was drawn, so it cannot disagree with the screen.
	function renderNodes(
		nodes: TreeNode[],
		depth: number,
		parentId: string | null,
	): HTMLElement[] {
		const drawn: HTMLElement[] = [];
		for (const node of nodes) {
			if (node.type === "folder") {
				drawn.push(record(folderRow(node, depth), node, depth, parentId));
				if (!collapsed.has(node.id)) {
					drawn.push(...renderNodes(view.children(node), depth + 1, node.id));
				}
				continue;
			}
			const doc = view.item(node);
			// An id whose chapter did not load has nothing to draw
			if (doc)
				drawn.push(record(docRow(doc, depth, parentId), node, depth, parentId));
		}
		return drawn;
	}

	/** Files a rendered row into `rows`, in render order, and hands it back. */
	function record(
		el: HTMLElement,
		node: TreeNode,
		depth: number,
		parentId: string | null,
	): HTMLElement {
		el.dataset.id = node.id;
		rows.push({ id: node.id, type: node.type, parentId, depth, el });
		return el;
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
