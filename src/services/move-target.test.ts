import { describe, expect, it } from "vitest";
import type { TreeNode } from "../types";
import { type DropRow, keyboardTarget, resolveDrop } from "./move-target";

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

const H = 20;
const INDENT = 16;

/** Rows in render order, stacked at `H` apiece. */
const rows = (
	...spec: [
		id: string,
		type: DropRow["type"],
		parentId: string | null,
		depth: number,
	][]
): DropRow[] =>
	spec.map(([id, type, parentId, depth], i) => ({
		id,
		type,
		parentId,
		depth,
		top: i * H,
		height: H,
	}));

const open = rows(
	["f1", "folder", null, 0],
	["c1", "item", "f1", 1],
	["f2", "folder", "f1", 1],
	["c2", "item", "f2", 2],
	["c3", "item", null, 0],
);

/** A point inside row `n`, at the fraction `at` down it. */
const y = (n: number, at: number) => n * H + at * H;
const drop = (r: DropRow[], x: number, at: number, t: TreeNode[], id: string) =>
	resolveDrop(r, x, at, INDENT, t, id);

describe("resolveDrop", () => {
	it("drops inside a folder from its middle band", () => {
		expect(drop(open, 0, y(2, 0.5), tree, "c3")).toMatchObject({
			parentId: "f2",
			beforeId: null,
			indicator: { kind: "into", rowId: "f2" },
		});
	});

	it("reads one gap the same way from either side of it", () => {
		// The strip between the f1 header and its first child. Under the old
		// per-row bands this was "after f1, at the root" from above and "before
		// c1, inside f1" from below — one strip, two answers, no visual cue.
		const above = drop(open, 0, y(0, 0.9), tree, "c3");
		const below = drop(open, 0, y(1, 0.1), tree, "c3");
		expect(above).toMatchObject({ parentId: "f1", beforeId: "c1" });
		expect(below).toEqual(above);
	});

	it("picks the level from the pointer's x where a gap is ambiguous", () => {
		// Under c2 (depth 2) and over c3 (depth 0): three real destinations in
		// one strip of pixels.
		const deep = drop(open, 40, y(3, 0.9), tree, "c1");
		expect(deep).toMatchObject({ parentId: "f2", beforeId: null });

		const middle = drop(open, INDENT, y(3, 0.9), tree, "c1");
		expect(middle).toMatchObject({ parentId: "f1", beforeId: null });

		const root = drop(open, 0, y(3, 0.9), tree, "c1");
		expect(root).toMatchObject({ parentId: null, beforeId: "c3" });

		// And the indicator says which one, so the choice is visible before the
		// pointer comes up
		expect([deep, middle, root].map((d) => d?.indicator.depth)).toEqual([
			2, 1, 0,
		]);
	});

	it("ignores x where the gap leaves nothing to choose", () => {
		// c1 and f2 are siblings, so both ends of the gap pin the same level
		const left = drop(open, 0, y(1, 0.9), tree, "c3");
		const right = drop(open, 200, y(1, 0.9), tree, "c3");
		expect(left).toMatchObject({ parentId: "f1", beforeId: "f2" });
		expect(right).toEqual(left);
	});

	it("reaches the root past either end of the list", () => {
		expect(drop(open, 0, 500, tree, "c1")).toMatchObject({
			parentId: null,
			beforeId: null,
			indicator: { kind: "after", rowId: "c3" },
		});
		expect(drop(open, 0, -5, tree, "c3")).toMatchObject({
			parentId: null,
			beforeId: "f1",
		});
	});

	it("drops into a folder that is collapsed or empty", () => {
		const collapsed = rows(
			["f1", "folder", null, 0],
			["c1", "item", "f1", 1],
			["f2", "folder", "f1", 1],
			["c3", "item", null, 0],
		);
		expect(drop(collapsed, 0, y(2, 0.5), tree, "c3")).toMatchObject({
			parentId: "f2",
			beforeId: null,
		});

		const empty: TreeNode[] = [folder("f3"), chapter("c1")];
		const emptyRows = rows(["f3", "folder", null, 0], ["c1", "item", null, 0]);
		expect(drop(emptyRows, 0, y(0, 0.5), empty, "c1")).toMatchObject({
			parentId: "f3",
			beforeId: null,
		});
	});

	// renderNodes skips a node whose document did not load, so a rendered row is
	// not always the tree sibling next to it.
	it("anchors on a row the user can see, never on one that was skipped", () => {
		const gappy: TreeNode[] = [
			folder("f1", [
				chapter("c1"),
				chapter("cx"),
				folder("f2", [chapter("c2")]),
			]),
			chapter("c3"),
		];
		// cx is in the tree but has no row. Dropping in the visible gap under c1
		// anchors on f2 — which lands the node after cx, where the pointer was.
		expect(drop(open, 0, y(1, 0.9), gappy, "c3")).toMatchObject({
			parentId: "f1",
			beforeId: "f2",
		});
	});

	it("refuses a drop on the dragged node itself", () => {
		expect(drop(open, 0, y(1, 0.1), tree, "c1")).toBeNull();
		expect(drop(open, 0, y(1, 0.9), tree, "c1")).toBeNull();
	});

	it("refuses a folder dropped inside its own subtree", () => {
		expect(drop(open, 0, y(2, 0.5), tree, "f1")).toBeNull();
		expect(drop(open, 0, y(1, 0.1), tree, "f1")).toBeNull();
	});

	it("has nothing to say about an empty list or a node that is gone", () => {
		expect(drop([], 0, 10, tree, "c1")).toBeNull();
		expect(drop(open, 0, y(1, 0.1), tree, "nope")).toBeNull();
	});
});

describe("keyboardTarget", () => {
	const move = (id: string, dir: Parameters<typeof keyboardTarget>[2]) =>
		keyboardTarget(tree, id, dir);

	it("steps over one sibling", () => {
		expect(move("c3", "up")).toEqual({ parentId: null, beforeId: "f1" });
		// Past f2 is past the end of f1's children, so c3 lands last
		expect(move("c1", "down")).toEqual({ parentId: "f1", beforeId: null });
	});

	it("steps out of a folder at either end of it", () => {
		// c1 is first inside f1, so up leaves the folder and lands above it
		expect(move("c1", "up")).toEqual({ parentId: null, beforeId: "f1" });
		// c2 is last inside f2, so down leaves f2 and lands after it, in f1
		expect(move("c2", "down")).toEqual({ parentId: "f1", beforeId: null });
	});

	it("indents into the folder above and outdents past the one it is in", () => {
		expect(move("c3", "in")).toEqual({ parentId: "f1", beforeId: null });
		expect(move("c1", "out")).toEqual({ parentId: null, beforeId: "c3" });
		expect(move("c2", "out")).toEqual({ parentId: "f1", beforeId: null });
	});

	it("has nowhere to go at the edges of the tree", () => {
		expect(move("f1", "up")).toBeNull();
		expect(move("c3", "down")).toBeNull();
		expect(move("c3", "out")).toBeNull();
		// Nothing above f1 at all, and c1 is not a folder to go into
		expect(move("f1", "in")).toBeNull();
		expect(move("f2", "in")).toBeNull();
		expect(move("nope", "up")).toBeNull();
	});
});
