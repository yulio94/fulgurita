import { store } from "../core/store";
import type { FolderNode, TreeNode } from "../types";

// The backend applies these same moves to `sietch.json`. The sidebar mirrors
// them locally rather than re-reading the file, which is what `addChapter`
// already does for `documents`.
//
// ponytail: every helper rebuilds the branches it walks instead of mutating in
// place. A manuscript's tree is a few hundred nodes, so the copy costs nothing
// worth measuring, and a new array is what the store's listeners want anyway.

/** Rebuilds the tree with `update` applied to the folder `id`. */
function updateFolder(
	tree: TreeNode[],
	id: string,
	update: (folder: FolderNode) => TreeNode,
): TreeNode[] {
	return tree.map((node) => {
		if (node.type !== "folder") return node;
		if (node.id === id) return update(node);
		return { ...node, children: updateFolder(node.children, id, update) };
	});
}

export function findNode(tree: TreeNode[], id: string): TreeNode | null {
	for (const node of tree) {
		if (node.id === id) return node;
		if (node.type === "folder") {
			const found = findNode(node.children, id);
			if (found) return found;
		}
	}
	return null;
}

/** The folder holding `id`, or null when it sits at the root or is missing. */
export function findParentId(tree: TreeNode[], id: string): string | null {
	for (const node of tree) {
		if (node.type !== "folder") continue;
		if (node.children.some((child) => child.id === id)) return node.id;
		const found = findParentId(node.children, id);
		if (found) return found;
	}
	return null;
}

/**
 * Appends `node` inside `parentId`, or at the root when there is no parent or
 * the folder is gone. Matches what the backend does with the same arguments.
 */
export function insertNode(
	tree: TreeNode[],
	node: TreeNode,
	parentId: string | null,
): TreeNode[] {
	if (!parentId || !findNode(tree, parentId)) return [...tree, node];
	return updateFolder(tree, parentId, (folder) => ({
		...folder,
		children: [...folder.children, node],
	}));
}

export function removeNode(tree: TreeNode[], id: string): TreeNode[] {
	return tree
		.filter((node) => node.id !== id)
		.map((node) =>
			node.type === "folder"
				? { ...node, children: removeNode(node.children, id) }
				: node,
		);
}

export function renameFolderNode(
	tree: TreeNode[],
	id: string,
	title: string,
): TreeNode[] {
	return updateFolder(tree, id, (folder) => ({ ...folder, title }));
}

/**
 * Applies `apply` to the tree held in the store. The backend has already written
 * the same change to `sietch.json`, so this keeps the two in step without a
 * re-read — the same mirroring `addChapter` does for `documents`.
 */
export function updateTree(apply: (tree: TreeNode[]) => TreeNode[]): void {
	const meta = store.get("projectMeta");
	if (!meta) return;
	store.set("projectMeta", { ...meta, tree: apply(meta.tree) });
}
