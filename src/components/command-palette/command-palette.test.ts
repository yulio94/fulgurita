import { beforeEach, expect, test, vi } from "vitest";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { Doc, ProjectMeta } from "../../types";

const readChapter = vi.hoisted(() => vi.fn());
// services/chapters.ts pulls from the same module id, so the factory has to cover
// every named export it reaches for, not just the one under test.
vi.mock("../../services/invoke", () => ({
	readChapter,
	renameChapter: vi.fn(),
}));

const { createCommandPalette } = await import("./command-palette");
const { formatShortcut } = await import("../../services/platform");

initI18n("en");
createCommandPalette();

const doc = (id: string, title: string): Doc => ({ id, title }) as Doc;

// Queried by structure, not by class: the CSS module names are hashed.
const overlay = () => document.body.lastElementChild as HTMLElement;
const input = () => overlay().querySelector("input") as HTMLInputElement;
const rows = () => [...(input().nextElementSibling?.children ?? [])];
const labels = () => rows().map((row) => row.textContent ?? "");

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	vi.clearAllMocks();
	readChapter.mockResolvedValue({
		frontmatter: {
			title: "The Crossing",
			type: "chapter",
			language: "en",
			tags: [],
		},
		body: "Whoever keeps the ledger.",
	});
	bus.emit("palette:close");
	store.set("projectPath", "/tmp/project");
	store.set("documents", [
		doc("ch-1", "Prologue"),
		doc("ch-2", "The Crossing"),
	]);
	store.set("selectedFolder", null);
	store.set("projectMeta", {
		name: "Novel",
		tree: [
			{
				type: "folder",
				id: "f1",
				title: "Part One",
				children: [{ type: "item", id: "ch-2", kind: "chapter" }],
			},
			{ type: "item", id: "ch-1", kind: "chapter" },
		],
	} as ProjectMeta);
});

test("Cmd+P lists the chapters, filters them, and Enter opens one", async () => {
	bus.emit("palette:open-docs");

	expect(rows()).toHaveLength(2);
	expect(labels().join("|")).toContain("Prologue");

	input().value = "Cross";
	input().dispatchEvent(new Event("input"));

	expect(rows()).toHaveLength(1);
	expect(labels()[0]).toContain("The Crossing");

	input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
	await tick();

	expect(readChapter).toHaveBeenCalledWith("/tmp/project", "ch-2");
	// Same as clicking the sidebar row: the next new chapter lands beside this one
	expect(store.get("selectedFolder")).toBe("f1");
	// The overlay is gone
	expect(document.body.querySelector("input")).toBeNull();
});

test("Cmd+K still lists commands only, keyed for the platform", () => {
	bus.emit("palette:open");

	expect(labels().some((l) => l.includes("Prologue"))).toBe(false);
	expect(labels().join("|")).toContain("Save");

	// happy-dom is not a Mac, so Mod renders as the Windows/Linux modifier
	expect(formatShortcut("Mod+Shift+I")).toEqual(["Ctrl", "Shift", "I"]);
	const keys = [...overlay().querySelectorAll("kbd")].map((k) => k.textContent);
	expect(keys).toContain("Ctrl");
	expect(keys).not.toContain("Cmd");
});

test("the research picker lists files by folder and hands back the one chosen", async () => {
	const { pickResearch } = await import("./command-palette");
	store.set("research", [
		{
			type: "folder",
			id: "research/Places",
			title: "Places",
			children: [
				{
					type: "item",
					id: "research/Places/harbour.png",
					kind: "file",
					title: "harbour.png",
					url: "",
				},
			],
		},
		{
			type: "item",
			id: "research/notes.md",
			kind: "markdown",
			title: "Worldbuilding",
			url: "",
		},
	]);
	const picked: string[] = [];

	pickResearch((item) => picked.push(item.id));
	// Folders are not rows, only what is in them. The folder is the category.
	expect(labels()).toEqual(["Placesharbour.png", "ResearchWorldbuilding"]);

	input().value = "Places";
	input().dispatchEvent(new Event("input"));
	input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

	expect(picked).toEqual(["research/Places/harbour.png"]);
	store.set("research", []);
});
