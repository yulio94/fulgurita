import { afterEach, describe, expect, it } from "vitest";
import { store } from "../core/store";
import type { Doc, FolderNode, ProjectMeta, TreeNode } from "../types";
import { manuscriptProvider } from "./providers";

const doc = (id: string) => ({ id, title: id }) as Doc;
const chapter = (id: string): TreeNode => ({
	type: "item",
	id,
	kind: "chapter",
});

// The store is a module singleton shared with every other test file
afterEach(() => {
	store.set("projectMeta", null);
	store.set("documents", []);
});

describe("manuscriptProvider", () => {
	it("roots are the project tree", () => {
		const tree = [chapter("c1"), chapter("c2")];
		store.set("projectMeta", { name: "Novel", tree } as ProjectMeta);
		expect(manuscriptProvider.roots()).toBe(tree);
	});

	// Browser-only dev and the sidebar tests have documents but no project
	it("roots fall back to a flat list of the loaded documents", () => {
		store.set("documents", [doc("c1"), doc("c2")]);
		expect(manuscriptProvider.roots()).toEqual([chapter("c1"), chapter("c2")]);
	});

	it("children are the folder's own", () => {
		const folder: FolderNode = {
			type: "folder",
			id: "f1",
			title: "Part One",
			children: [chapter("c1")],
		};
		expect(manuscriptProvider.children(folder)).toBe(folder.children);
	});

	it("an item resolves to its document, and to null when it never loaded", () => {
		const loaded = doc("c1");
		store.set("documents", [loaded]);
		expect(manuscriptProvider.item(chapter("c1"))).toBe(loaded);
		expect(manuscriptProvider.item(chapter("gone"))).toBeNull();
	});
});
