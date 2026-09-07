import { describe, expect, it } from "vitest";
import type { TreeNode } from "../types";
import {
	findNode,
	findParentId,
	insertNode,
	moveNode,
	removeNode,
	renameFolderNode,
} from "./tree";

const folder = (id: string, children: TreeNode[] = []): TreeNode => ({
	type: "folder",
	id,
	title: id,
	children,
});
const chapter = (id: string): TreeNode => ({
	type: "item",
	id,
	kind: "chapter",
});

/** The tree as one line. Folders always carry their parentheses. */
const shape = (nodes: TreeNode[]): string =>
	nodes
		.map((node) =>
			node.type === "folder" ? `${node.id}(${shape(node.children)})` : node.id,
		)
		.join(",");

// f1 > [c1, f2 > [c2]], c3
const tree: TreeNode[] = [
	folder("f1", [chapter("c1"), folder("f2", [chapter("c2")])]),
	chapter("c3"),
];

describe("tree", () => {
	it("finds nodes and their parent at any depth", () => {
		expect(findNode(tree, "c2")).toEqual(chapter("c2"));
		expect(findNode(tree, "nope")).toBeNull();

		expect(findParentId(tree, "c2")).toBe("f2");
		expect(findParentId(tree, "f2")).toBe("f1");
		expect(findParentId(tree, "c3")).toBeNull();
		expect(findParentId(tree, "nope")).toBeNull();
	});

	it("inserts into a nested folder", () => {
		const next = insertNode(tree, chapter("c4"), "f2");
		expect(findParentId(next, "c4")).toBe("f2");
		// The branches it did not touch keep their identity
		expect(next[1]).toBe(tree[1]);
	});

	it("falls back to the root when the parent is gone", () => {
		// Matches the backend: a stale selection must not lose the new chapter
		const orphaned = insertNode(tree, chapter("c4"), "gone");
		expect(orphaned[orphaned.length - 1]).toEqual(chapter("c4"));
		expect(findParentId(orphaned, "c4")).toBeNull();

		const rooted = insertNode(tree, chapter("c4"), null);
		expect(rooted[rooted.length - 1]).toEqual(chapter("c4"));
	});

	// The same shape helper the Rust tests use, on the same fixture. These two
	// implementations agreeing is the whole contract, so the cases are the same
	// list in the same order — see `models::project::tests`.
	it("reorders among siblings in both directions", () => {
		// Backwards past a sibling: the anchor sits at 0 only once c3 is out.
		const up = moveNode(tree, "c3", null, "f1");
		expect(shape(up)).toBe("c3,f1(c1,f2(c2))");

		// And forwards again, with no anchor, which means last.
		expect(shape(moveNode(up, "c3", null, null))).toBe("f1(c1,f2(c2)),c3");

		// The source is left alone, like every other helper here
		expect(shape(tree)).toBe("f1(c1,f2(c2)),c3");
	});

	it("moves a leaf into a folder and back out to the root", () => {
		const into = moveNode(tree, "c3", "f2", null);
		expect(shape(into)).toBe("f1(c1,f2(c2,c3))");

		const across = moveNode(into, "c3", "f1", "c1");
		expect(shape(across)).toBe("f1(c3,c1,f2(c2))");

		expect(shape(moveNode(across, "c3", null, null))).toBe("f1(c1,f2(c2)),c3");
	});

	it("takes a folder's children with it", () => {
		expect(shape(moveNode(tree, "f2", null, "f1"))).toBe("f2(c2),f1(c1),c3");
	});

	it("appends on a missing anchor and roots on a missing parent", () => {
		expect(shape(moveNode(tree, "c3", "f1", "gone"))).toBe("f1(c1,f2(c2),c3)");
		expect(shape(moveNode(tree, "c1", "gone", null))).toBe("f1(f2(c2)),c3,c1");
	});

	it("returns the tree untouched for the moves the backend refuses", () => {
		// Identity, not just equality: nothing was rebuilt
		expect(moveNode(tree, "f1", "f1", null)).toBe(tree);
		expect(moveNode(tree, "f1", "f2", null)).toBe(tree);
		expect(moveNode(tree, "f1", "c1", null)).toBe(tree);
		expect(moveNode(tree, "nope", null, null)).toBe(tree);
		// Not a no-op if it were let through: the anchor goes with the removal
		// and the node would silently land last.
		expect(moveNode(tree, "c3", null, "c3")).toBe(tree);
	});

	it("removes and renames at any depth, leaving the source alone", () => {
		expect(findNode(removeNode(tree, "c2"), "c2")).toBeNull();
		expect(removeNode(tree, "f1")).toEqual([chapter("c3")]);

		const renamed = renameFolderNode(tree, "f2", "Act Two");
		expect(findNode(renamed, "f2")).toEqual({
			type: "folder",
			id: "f2",
			title: "Act Two",
			children: [chapter("c2")],
		});
		expect(findNode(tree, "f2")).toEqual(folder("f2", [chapter("c2")]));
	});
});
