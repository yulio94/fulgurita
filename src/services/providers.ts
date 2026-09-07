import { bus } from "../core/bus";
import { store } from "../core/store";
import { getLL } from "../i18n";
import type { Doc, FolderNode, TreeNode } from "../types";
import { openChapter, toTrashDoc } from "./chapters";
import { listTrash } from "./invoke";

/** One row of a view's context menu. The OS menu is what draws it. */
export interface ViewMenuItem {
	/** Unique within the menu; the OS wants an id per item. */
	id: string;
	text: string;
	action: () => void;
}

/**
 * A view of the sidebar tree. The sidebar renders the nodes it is handed and
 * knows nothing about where they came from; a provider holds that knowledge.
 *
 * ponytail: synchronous, where F-072 sketched promises. The tree is already in
 * the store and `rerender` runs straight out of click handlers, so awaiting
 * would only buy a generation guard against out-of-order paints. The trash
 * fetches, but into the store, which is what repaints — the interface stayed
 * synchronous. The first view that has to fetch *while rendering* turns this
 * async, and it can pay for it.
 */
export interface ViewProvider {
	readonly id: string;
	/**
	 * Whether the sidebar may reorder these nodes. Only a view backed by
	 * `projectMeta.tree` can be: `move_node` writes that tree and no other.
	 * Required rather than defaulted, so a new view has to answer.
	 *
	 * It also gates the inline rename and the header's new buttons, for the same
	 * reason one step further out: a view not backed by that tree is one nothing
	 * can be written through.
	 */
	readonly reorderable: boolean;
	/** Header title for this view. */
	label(): string;
	/** Root nodes, in render order. */
	roots(): TreeNode[];
	/** Children of a folder, in render order. */
	children(folder: FolderNode): TreeNode[];
	/** The document a leaf draws as, or null when it has nothing to draw. */
	item(node: TreeNode): Doc | null;
	/** Context menu for a row, in order. Empty means no menu at all. */
	menu(node: TreeNode): ViewMenuItem[];
	/** What a click on a leaf does. A view may have nothing to open. */
	open(doc: Doc): void;
}

/** The manuscript: the project tree as `sietch.json` has it. */
export const manuscriptProvider: ViewProvider = {
	id: "manuscript",
	reorderable: true,

	// A function rather than a field: `getLL` throws until `initI18n` has run,
	// and this module is imported long before that.
	label: () => getLL().library(),

	roots() {
		const docs = store.get("documents") ?? [];
		// No project meta means no tree: browser-only dev, and the tests. Falling
		// back to a flat list keeps the sidebar readable rather than empty.
		return (
			store.get("projectMeta")?.tree ??
			docs.map(
				(doc): TreeNode => ({ type: "item", id: doc.id, kind: "chapter" }),
			)
		);
	},

	children: (folder) => folder.children,

	item(node) {
		return store.get("documents")?.find((doc) => doc.id === node.id) ?? null;
	},

	menu(node) {
		const LL = getLL();
		const folder = node.type === "folder";
		return [
			{
				id: `rename:${node.id}`,
				text: LL.rename(),
				action: () => bus.emit("tree:rename", node.id),
			},
			{
				id: `delete:${node.id}`,
				text: folder ? LL.deleteFolder() : LL.deleteChapter(),
				action: () =>
					bus.emit(folder ? "folder:delete" : "document:delete", node.id),
			},
		];
	},

	open: (doc) => void openChapter(doc),
};

/** What is in `trash/`, and the way back into the manuscript (F-112). */
export const trashProvider: ViewProvider = {
	id: "trash",
	// Its order is the backend's, newest first, and `move_node` writes the
	// manuscript tree — there is nothing here for a drag to persist.
	reorderable: false,

	label: () => getLL().trash(),

	// Flat. Folders own no file, so deleting one never puts it in `trash/` — it
	// sends its chapters there and goes.
	roots: () =>
		store
			.get("trash")
			.map((doc): TreeNode => ({ type: "item", id: doc.id, kind: "chapter" })),

	children: () => [],

	item: (node) => store.get("trash").find((doc) => doc.id === node.id) ?? null,

	menu: (node) => [
		{
			id: `restore:${node.id}`,
			text: getLL().restore(),
			action: () => bus.emit("document:restore", node.id),
		},
	],

	// A trashed file is not under `chapters/`, which is the only place
	// `read_chapter` looks. Restoring is what makes it readable again.
	open: () => {},
};

/**
 * Reads `trash/` into the store, which is what repaints the sidebar. Called on
 * the way into the view and after a restore rather than kept in step with every
 * delete: the trash is the one list nobody is looking at most of the time.
 */
export async function loadTrash(): Promise<void> {
	const projectPath = store.get("projectPath");
	if (!projectPath) return;
	try {
		store.set("trash", (await listTrash(projectPath)).map(toTrashDoc));
	} catch (err) {
		// Browser-only dev has no backend, and a project folder can go away under
		// a running app. Either way the view shows what it last had.
		console.error(err);
	}
}
