import type { TreeNode } from "../types";
import { containsNode, findNode, findParentId } from "./tree";

/**
 * A rendered row, as `renderNodes` recorded it. `top` is in the list's content
 * coordinates, so a scroll does not invalidate a measurement.
 */
export interface DropRow {
	id: string;
	type: TreeNode["type"];
	parentId: string | null;
	depth: number;
	top: number;
	height: number;
}

/**
 * Where a drop would land, and how to draw it. `parentId` and `beforeId` are
 * what `moveNode` takes; `indicator` is what the sidebar marks up, so it never
 * has to work the position out a second time. The indicator's `depth` is the
 * level the node would sit at, which is what makes the choice in `atGap` visible
 * before the pointer is released.
 */
export interface Drop {
	parentId: string | null;
	beforeId: string | null;
	indicator: {
		kind: "before" | "after" | "into";
		rowId: string;
		depth: number;
	};
}

// A folder row's middle means "inside it". Only a folder has an inside, so on an
// item row the whole height splits down the middle into the gap above and below.
const EDGE = 0.25;

/**
 * The drop `(x, y)` would make over `rows`, or null when there is nothing to do:
 * the pointer is over the dragged node itself, the move would put a folder
 * inside its own subtree, or it would put the node back where it already is.
 *
 * `move_node` refuses the same moves. This is the presentation half — it keeps
 * the indicator off a target that would come back an error.
 */
export function resolveDrop(
	rows: DropRow[],
	x: number,
	y: number,
	indent: number,
	tree: TreeNode[],
	draggedId: string,
): Drop | null {
	if (rows.length === 0) return null;

	const dragged = findNode(tree, draggedId);
	if (!dragged) return null;

	const drop = locate(rows, x, y, indent, tree);
	if (!drop) return null;

	// The three the backend refuses...
	if (drop.beforeId === draggedId) return null;
	if (drop.parentId === draggedId) return null;
	if (drop.parentId && containsNode(dragged, drop.parentId)) return null;

	// ...and the move that changes nothing, which the backend would refuse as
	// `before == id` or spend a disk write on.
	if (
		drop.parentId === findParentId(tree, draggedId) &&
		drop.beforeId === nextSiblingId(tree, draggedId)
	) {
		return null;
	}

	return drop;
}

/** The raw target under the pointer, before any of it is judged. */
function locate(
	rows: DropRow[],
	x: number,
	y: number,
	indent: number,
	tree: TreeNode[],
): Drop | null {
	const first = rows[0];
	const last = rows[rows.length - 1];

	if (y < first.top) return atGap(undefined, first, x, indent, tree);
	if (y >= last.top + last.height)
		return atGap(last, undefined, x, indent, tree);

	const index = rows.findIndex(
		(row) => y >= row.top && y < row.top + row.height,
	);
	if (index < 0) return null;
	const row = rows[index];
	const band = (y - row.top) / row.height;

	if (row.type === "folder" && band >= EDGE && band < 1 - EDGE) {
		return {
			parentId: row.id,
			beforeId: null,
			indicator: { kind: "into", rowId: row.id, depth: row.depth },
		};
	}

	// Everything that is not "inside a folder" is a gap between two rows. Naming
	// the gap before resolving it is what stops one strip of pixels meaning two
	// different things depending on which row's half it was read from.
	return band < 0.5
		? atGap(rows[index - 1], row, x, indent, tree)
		: atGap(row, rows[index + 1], x, indent, tree);
}

/**
 * The drop for the gap between two rows, either of which may be missing at the
 * ends of the list.
 *
 * The gap under a node at depth 3 followed by one at depth 0 is four different
 * moves wearing one strip of pixels, so the horizontal position picks the level
 * — the same gesture an outliner uses, and the only way back out to the root
 * from the end of a folder. Where `below` pins the level there is nothing to
 * choose and `x` is ignored.
 */
function atGap(
	above: DropRow | undefined,
	below: DropRow | undefined,
	x: number,
	indent: number,
	tree: TreeNode[],
): Drop | null {
	if (!above) {
		if (!below) return null;
		return {
			parentId: below.parentId,
			beforeId: below.id,
			indicator: { kind: "before", rowId: below.id, depth: below.depth },
		};
	}

	// Straight under an open folder's header: the gap is its first child's slot.
	if (below && below.depth > above.depth) {
		return {
			parentId: above.id,
			beforeId: below.id,
			indicator: { kind: "before", rowId: below.id, depth: below.depth },
		};
	}

	const floor = below ? below.depth : 0;
	const depth = Math.min(Math.max(Math.round(x / indent), floor), above.depth);

	// One level up per step out of `above`'s own depth.
	let parentId = above.parentId;
	for (let step = above.depth; step > depth; step--) {
		parentId = parentId ? findParentId(tree, parentId) : null;
	}

	return {
		parentId,
		beforeId: below && below.depth === depth ? below.id : null,
		indicator: { kind: "after", rowId: above.id, depth },
	};
}

/**
 * The node after `id` among its own siblings. Read off the tree, never off the
 * rendered rows: `renderNodes` skips a node whose document did not load, so the
 * row after one on screen is not always the sibling after it in the tree.
 */
function nextSiblingId(tree: TreeNode[], id: string): string | null {
	const parentId = findParentId(tree, id);
	const parent = parentId ? findNode(tree, parentId) : null;
	const list = parent?.type === "folder" ? parent.children : tree;
	const index = list.findIndex((node) => node.id === id);
	if (index < 0 || index + 1 >= list.length) return null;
	return list[index + 1].id;
}
