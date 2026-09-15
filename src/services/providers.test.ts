import { afterEach, describe, expect, it, vi } from "vitest";
import { bus } from "../core/bus";
import { store } from "../core/store";
import { initI18n } from "../i18n";
import type {
	Doc,
	FolderNode,
	ProjectMeta,
	ResearchItem,
	TreeNode,
} from "../types";
import {
	listResearch,
	listTrash,
	openResearchFile,
	readResearch,
} from "./invoke";
import { iconNames } from "./menu-icons";
import {
	loadTrash,
	manuscriptProvider,
	researchProvider,
	trashProvider,
	views,
} from "./providers";
import { toResearchDoc } from "./research";

vi.mock("./invoke", async (actual) => ({
	...(await actual<typeof import("./invoke")>()),
	listTrash: vi.fn(),
	listResearch: vi.fn(),
	readResearch: vi.fn(),
	openResearchFile: vi.fn(),
}));

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
	store.set("trash", []);
	store.set("research", []);
	store.set("activeDoc", null);
	store.set("projectPath", null);
	vi.mocked(listTrash).mockReset();
	vi.mocked(listResearch).mockReset();
	vi.mocked(readResearch).mockReset();
	vi.mocked(openResearchFile).mockReset();
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

	it("a chapter's menu renames and deletes, a folder's deletes the folder", () => {
		initI18n("en");
		const folder: FolderNode = {
			type: "folder",
			id: "f1",
			title: "Part One",
			children: [],
		};
		expect(manuscriptProvider.menu(chapter("c1")).map((i) => i.text)).toEqual([
			"Rename",
			"Delete chapter",
		]);
		expect(manuscriptProvider.menu(folder).map((i) => i.text)).toEqual([
			"Rename",
			"Delete folder",
		]);

		const seen: string[] = [];
		const off = [
			bus.on("tree:rename", (id) => seen.push(`rename:${id}`)),
			bus.on("document:delete", (id) => seen.push(`chapter:${id}`)),
			bus.on("folder:delete", (id) => seen.push(`folder:${id}`)),
		];
		for (const item of manuscriptProvider.menu(chapter("c1"))) item.action();
		manuscriptProvider.menu(folder)[1].action();
		for (const unsubscribe of off) unsubscribe();

		expect(seen).toEqual(["rename:c1", "chapter:c1", "folder:f1"]);
	});
});

describe("trashProvider", () => {
	it("roots are what is in the trash, flat", () => {
		store.set("trash", [doc("c1"), doc("c2")]);
		expect(trashProvider.roots()).toEqual([chapter("c1"), chapter("c2")]);
		// Folders own no file, so a delete never puts one in `trash/`
		expect(
			trashProvider.children({
				type: "folder",
				id: "f1",
				title: "Part One",
				children: [chapter("c1")],
			}),
		).toEqual([]);
	});

	it("an item resolves against the trash, not the manuscript", () => {
		const trashed = doc("c1");
		store.set("trash", [trashed]);
		store.set("documents", [doc("c2")]);
		expect(trashProvider.item(chapter("c1"))).toBe(trashed);
		expect(trashProvider.item(chapter("c2"))).toBeNull();
	});

	it("the menu offers restore alone, and asks main.ts for it", () => {
		initI18n("en");
		const items = trashProvider.menu(chapter("c1"));
		expect(items.map((i) => i.text)).toEqual(["Restore"]);

		const seen: string[] = [];
		const off = bus.on("document:restore", (id) => seen.push(id));
		items[0].action();
		off();
		expect(seen).toEqual(["c1"]);
	});

	// A trashed file is not under `chapters/`, which is the only place
	// `read_chapter` looks
	it("nothing opens, and nothing is reordered", () => {
		expect(trashProvider.reorderable).toBe(false);
		expect(() => trashProvider.open(doc("c1"))).not.toThrow();
		expect(store.get("activeDoc")).toBeNull();
	});
});

describe("loadTrash", () => {
	it("reads the folder into the store", async () => {
		initI18n("en");
		store.set("projectPath", "/tmp/novel");
		vi.mocked(listTrash).mockResolvedValue([
			{
				id: "c1",
				title: "One",
				type: "chapter",
				language: "en",
				tags: [],
				synopsis: "",
				pov: "",
				word_count: 4,
				modified: new Date().toISOString(),
				deleted: new Date().toISOString(),
			},
		]);

		await loadTrash();
		expect(listTrash).toHaveBeenCalledWith("/tmp/novel");
		expect(store.get("trash").map((d) => d.title)).toEqual(["One"]);
		expect(store.get("trash")[0].meta).toMatch(/^Deleted /);
	});

	// Browser-only dev, and a project folder that went away under a running app
	it("keeps what it had when the backend refuses", async () => {
		store.set("projectPath", "/tmp/novel");
		store.set("trash", [doc("stale")]);
		vi.mocked(listTrash).mockRejectedValue(new Error("no backend"));
		const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

		await loadTrash();
		expect(store.get("trash").map((d) => d.id)).toEqual(["stale"]);
		quiet.mockRestore();
	});

	it("does nothing with no project open", async () => {
		await loadTrash();
		expect(listTrash).not.toHaveBeenCalled();
	});
});

const research = (kind: ResearchItem["kind"], name: string): ResearchItem => ({
	type: "item",
	id: `research/${name}`,
	kind,
	title: name,
	url: kind === "link" ? "https://atlas.test/maps" : "",
});

describe("researchProvider", () => {
	it("a file goes to the OS and a markdown document to the editor", async () => {
		initI18n("en");
		store.set("projectPath", "/tmp/novel");
		vi.mocked(openResearchFile).mockResolvedValue();
		vi.mocked(readResearch).mockResolvedValue("# Harbour");
		const loaded: Doc[] = [];
		const off = bus.on("document:load", (d) => loaded.push(d));

		// open() looks the item up, the way a row click reaches it
		store.set("research", [
			research("file", "map.png"),
			research("markdown", "notes.md"),
		]);
		researchProvider.open(toResearchDoc(research("file", "map.png")));
		expect(openResearchFile).toHaveBeenCalledWith(
			"/tmp/novel",
			"research/map.png",
		);
		expect(readResearch).not.toHaveBeenCalled();

		researchProvider.open(toResearchDoc(research("markdown", "notes.md")));
		await vi.waitFor(() => expect(loaded).toHaveLength(1));
		expect(readResearch).toHaveBeenCalledWith(
			"/tmp/novel",
			"research/notes.md",
		);
		expect(store.get("activeDoc")?.content).toContain("Harbour");
		off();
	});

	it("only a link offers to open its URL, and a folder has no menu", () => {
		initI18n("en");
		const text = (node: TreeNode) =>
			researchProvider.menu(node).map((item) => item.text);

		expect(text(research("link", "Atlas.md"))).toEqual([
			"Open link",
			"Open with default app",
		]);
		expect(text(research("file", "map.png"))).toEqual([
			"Open with default app",
		]);
		expect(
			text({
				type: "folder",
				id: "research/Places",
				title: "Places",
				children: [],
			}),
		).toEqual([]);
	});

	it("a row's second line is the link's host or the file's extension", () => {
		expect(toResearchDoc(research("link", "Atlas.md")).preview).toBe(
			"atlas.test",
		);
		expect(toResearchDoc(research("file", "scan.final.pdf")).preview).toBe(
			"PDF",
		);
	});
});

// `icon` being required on `ViewMenuItem` is half of "every row has one"; the
// compiler cannot check that the name has artwork behind it. A view added later
// fails here rather than shipping a blank menu.
describe("every view", () => {
	it("names a real icon on every row of every menu", () => {
		initI18n("en");
		const folder: FolderNode = {
			type: "folder",
			id: "f1",
			title: "Part One",
			children: [],
		};

		for (const view of views) {
			for (const node of [chapter("c1"), folder, research("link", "a.md")]) {
				for (const item of view.menu(node)) {
					expect(iconNames).toContain(item.icon);
				}
			}
		}
	});
});
