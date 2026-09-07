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

/** Whether `id` sits somewhere inside `node`. A node does not contain itself. */
export function containsNode(node: TreeNode, id: string): boolean {
	return node.type === "folder" && findNode(node.children, id) !== null;
}

/** Puts `node` before the sibling `beforeId`, or last when it is not here. */
function insertBefore(
	nodes: TreeNode[],
	node: TreeNode,
	beforeId: string | null,
): TreeNode[] {
	const index = beforeId ? nodes.findIndex((n) => n.id === beforeId) : -1;
	if (index < 0) return [...nodes, node];
	return [...nodes.slice(0, index), node, ...nodes.slice(index)];
}

/**
 * Moves `id` inside `parentId`, before the sibling `beforeId`, or to the end of
 * that folder when it is null or names nothing there. A `parentId` of null, or
 * one naming a folder that is gone, means the root.
 *
 * An anchor rather than an index because the two copies of the tree are not the
 * same: `open_project` prunes chapters whose file is missing from the one the
 * frontend holds and leaves them in `sietch.json`. The same position would not
 * name the same gap on both sides; an id names one node on either.
 *
 * `move_node` refuses the same three moves and refuses them first, so a tree
 * handed back unchanged here is one the backend already rejected.
 */
export function moveNode(
	tree: TreeNode[],
	id: string,
	parentId: string | null,
	beforeId: string | null,
): TreeNode[] {
	const node = findNode(tree, id);
	if (!node) return tree;
	if (parentId === id || (parentId && containsNode(node, parentId)))
		return tree;
	if (beforeId === id) return tree;

	const without = removeNode(tree, id);
	const parent = parentId ? findNode(without, parentId) : null;
	// Falls back to the root when the folder is gone, or when the id names an
	// item — `insert_at_in` only ever descends into folders.
	if (!parentId || !parent || parent.type !== "folder") {
		return insertBefore(without, node, beforeId);
	}
	return updateFolder(without, parentId, (folder) => ({
		...folder,
		children: insertBefore(folder.children, node, beforeId),
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

/**
 * Every item id of `kind` under `node`, at any depth. What a folder delete
 * takes with it: the count goes in the confirmation, the ids say which
 * documents leave the store and whether the open chapter was one of them.
 */
export function itemIds(node: TreeNode, kind = "chapter"): string[] {
	if (node.type === "item") return node.kind === kind ? [node.id] : [];
	return node.children.flatMap((child) => itemIds(child, kind));
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
