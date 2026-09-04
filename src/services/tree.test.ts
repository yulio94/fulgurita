import { describe, expect, it } from "vitest";
import type { TreeNode } from "../types";
import {
	findNode,
	findParentId,
	insertNode,
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
