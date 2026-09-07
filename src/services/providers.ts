import { store } from "../core/store";
import { getLL } from "../i18n";
import type { Doc, FolderNode, TreeNode } from "../types";

/**
 * A view of the sidebar tree. The sidebar renders the nodes it is handed and
 * knows nothing about where they came from; a provider holds that knowledge.
 *
 * ponytail: synchronous, where F-072 sketched promises. The tree is already in
 * the store and `rerender` runs straight out of click handlers, so awaiting
 * would only buy a generation guard against out-of-order paints. The first
 * provider that has to fetch is what turns this async, and it can pay for it.
 */
export interface ViewProvider {
	readonly id: string;
	/**
	 * Whether the sidebar may reorder these nodes. Only a view backed by
	 * `projectMeta.tree` can be: `move_node` writes that tree and no other.
	 * Required rather than defaulted, so a new view has to answer.
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
};

/**
 * The views the selector offers, in menu order.
 *
 * ponytail: a plain array, not a register/unregister API. Every provider is a
 * module in this folder; nothing loads one at runtime.
 */
export const views: ViewProvider[] = [manuscriptProvider];
