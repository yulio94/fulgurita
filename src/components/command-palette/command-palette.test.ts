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
			title: "Muad'Dib",
			type: "chapter",
			language: "en",
			tags: [],
		},
		body: "He who controls the spice.",
	});
	bus.emit("palette:close");
	store.set("projectPath", "/tmp/project");
	store.set("documents", [doc("ch-1", "Dune"), doc("ch-2", "Muad'Dib")]);
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
	expect(labels().join("|")).toContain("Dune");

	input().value = "Muad";
	input().dispatchEvent(new Event("input"));

	expect(rows()).toHaveLength(1);
	expect(labels()[0]).toContain("Muad'Dib");

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

	expect(labels().some((l) => l.includes("Dune"))).toBe(false);
	expect(labels().join("|")).toContain("Save");

	// happy-dom is not a Mac, so Mod renders as the Windows/Linux modifier
	expect(formatShortcut("Mod+Shift+I")).toEqual(["Ctrl", "Shift", "I"]);
	const keys = [...overlay().querySelectorAll("kbd")].map((k) => k.textContent);
	expect(keys).toContain("Ctrl");
	expect(keys).not.toContain("Cmd");
});
