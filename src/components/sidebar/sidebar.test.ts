import { expect, test } from "vitest";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { ViewProvider } from "../../services/providers";
import type { Doc, ProjectMeta, TreeNode } from "../../types";
import { createSidebar } from "./sidebar";

// A malicious document title must render as text, never as live DOM.
test("doc title with <img onerror> is escaped, not executed", () => {
	initI18n("en");
	const container = document.createElement("div");
	createSidebar(container);

	const payload = '<img src=x onerror="alert(1)">';
	// renderDocs only reads id/title/preview/meta; cast the rest away.
	store.set("documents", [
		{ id: "1", title: payload, preview: "p", meta: "m" } as Doc,
	]);

	// If the fix regressed, innerHTML interpolation would create a real <img>.
	expect(container.querySelector("img")).toBeNull();
	// The payload survives as inert text.
	expect(container.textContent).toContain(payload);
});

const doc = (id: string, title: string): Doc =>
	({ id, title, preview: "p", meta: "m" }) as Doc;

const meta = (tree: TreeNode[]): ProjectMeta =>
	({ name: "Novel", tree }) as ProjectMeta;

const titles = (container: HTMLElement) =>
	[...(container.querySelector("#doc-list")?.children ?? [])].map(
		(row) => row.textContent,
	);

test("the tree renders nested and indented, and a folder collapses", () => {
	initI18n("en");
	const container = document.createElement("div");

	store.set("documents", [doc("c1", "Nested"), doc("c2", "Loose")]);
	store.set(
		"projectMeta",
		meta([
			{
				type: "folder",
				id: "f1",
				title: "Part One",
				children: [{ type: "item", id: "c1", kind: "chapter" }],
			},
			{ type: "item", id: "c2", kind: "chapter" },
		]),
	);
	createSidebar(container);

	// Depth-first: the folder, its chapter, then the root chapter
	expect(titles(container)).toEqual(["▾Part One", "Nestedpm", "Loosepm"]);

	const rows = [...(container.querySelector("#doc-list")?.children ?? [])];
	expect((rows[1] as HTMLElement).style.getPropertyValue("--depth")).toBe("1");
	expect((rows[2] as HTMLElement).style.getPropertyValue("--depth")).toBe("0");

	const toggle = container.querySelector(
		"[aria-expanded]",
	) as HTMLButtonElement;
	expect(toggle.getAttribute("aria-expanded")).toBe("true");
	toggle.click();

	// Collapsed: the chapter inside is gone, the one outside is not
	expect(titles(container)).toEqual(["▸Part One", "Loosepm"]);
	expect(
		container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded"),
	).toBe("false");

	// The delete button belongs to empty folders only — this one holds a chapter
	expect(container.querySelector('[aria-label="Delete folder"]')).toBeNull();
	store.set(
		"projectMeta",
		meta([{ type: "folder", id: "f2", title: "Empty", children: [] }]),
	);
	expect(
		container.querySelector('[aria-label="Delete folder"]'),
	).not.toBeNull();
});

// A tree entry whose chapter never loaded would otherwise draw a nameless row.
test("an id with no document is skipped", () => {
	initI18n("en");
	const container = document.createElement("div");

	store.set("documents", [doc("c1", "Only")]);
	store.set(
		"projectMeta",
		meta([
			{ type: "item", id: "c1", kind: "chapter" },
			{ type: "item", id: "gone", kind: "chapter" },
		]),
	);
	createSidebar(container);

	expect(titles(container)).toEqual(["Onlypm"]);
	store.set("projectMeta", null);
});

// The seam F-072 buys: the tree draws whatever a provider hands it, and swapping
// the provider swaps the view without the sidebar knowing what changed.
test("setProvider swaps the rendered nodes and the header title", () => {
	initI18n("en");
	const container = document.createElement("div");

	const stub = (id: string, ids: string[]): ViewProvider => ({
		id,
		label: () => `View ${id}`,
		roots: () => ids.map((i) => ({ type: "item", id: i, kind: "chapter" })),
		children: (folder) => folder.children,
		item: (node) => doc(node.id, node.id.toUpperCase()),
	});

	const sidebar = createSidebar(container, stub("a", ["c1"]));
	expect(container.querySelector("#view-title")?.textContent).toBe("View a");
	expect(titles(container)).toEqual(["C1pm"]);

	sidebar.setProvider(stub("b", ["c2", "c3"]));
	expect(container.querySelector("#view-title")?.textContent).toBe("View b");
	expect(titles(container)).toEqual(["C2pm", "C3pm"]);
});
