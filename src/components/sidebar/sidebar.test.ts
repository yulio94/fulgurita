import { afterEach, expect, test, vi } from "vitest";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import { moveNode } from "../../services/invoke";
import type { ViewProvider } from "../../services/providers";
import type { Doc, ProjectMeta, TreeNode } from "../../types";
import { createSidebar } from "./sidebar";

// Collapsed folders persist through the Tauri store plugin, which has no
// backend here — and `openStore` only guards the import, not the calls.
vi.mock("../../services/config", () => ({
	getCollapsed: () => Promise.resolve([]),
	setCollapsed: () => Promise.resolve(),
}));

// The sidebar calls this on a drop; nothing else in these tests reaches Tauri.
vi.mock("../../services/invoke", async (actual) => ({
	...(await actual<typeof import("../../services/invoke")>()),
	moveNode: vi.fn(() => Promise.resolve()),
}));

afterEach(async () => {
	// A drop arms a one-shot click swallow that is disarmed on the next
	// macrotask. Let that window close, or it eats the next test's click.
	await new Promise((resolve) => setTimeout(resolve, 0));
	document.body.replaceChildren();
	vi.mocked(moveNode).mockClear();
	store.set("projectMeta", null);
	store.set("projectPath", null);
	store.set("documents", []);
	store.set("activeDoc", null);
	store.set("selectedFolder", null);
});

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
});

// The seam F-072 buys: the tree draws whatever a provider hands it, and swapping
// the provider swaps the view without the sidebar knowing what changed.
test("setProvider swaps the rendered nodes and the header title", () => {
	initI18n("en");
	const container = document.createElement("div");

	const stub = (id: string, ids: string[]): ViewProvider => ({
		id,
		reorderable: false,
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

// --- Drag to reorder (F-022) ---

const ROW_H = 20;

/**
 * happy-dom runs no layout, so every rect is zero and `offsetTop` is a
 * read-only 0. Stack the rows by hand instead; the drop math itself is unit
 * tested against fabricated rects in `services/drop-target.test.ts`.
 */
function layout(container: HTMLElement) {
	const list = container.querySelector("#doc-list") as HTMLElement;
	list.getBoundingClientRect = () => new DOMRect(0, 0, 200, 400);
	[...list.children].forEach((row, i) => {
		(row as HTMLElement).getBoundingClientRect = () =>
			new DOMRect(0, i * ROW_H, 200, ROW_H);
	});
	return list;
}

const pointer = (el: Element, type: string, x: number, y: number) =>
	el.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			clientX: x,
			clientY: y,
			button: 0,
			isPrimary: true,
			pointerId: 1,
			pointerType: "mouse",
		}),
	);

/** A sidebar over `f1 > [c1], c2`, laid out and ready to drag. */
function dragging() {
	initI18n("en");
	const container = document.createElement("div");
	store.set("projectPath", "/tmp/novel");
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
	document.body.append(container);
	createSidebar(container);
	return { container, list: layout(container) };
}

/** Rows in render order: f1, c1, c2. */
const rowAt = (list: HTMLElement, n: number) => list.children[n] as HTMLElement;

test("a drag drops a chapter into a folder", async () => {
	const { list } = dragging();
	// c2 is the third row; drop it on the middle of the f1 header
	pointer(rowAt(list, 2), "pointerdown", 40, 2.5 * ROW_H);
	pointer(list, "pointermove", 40, 0.5 * ROW_H);
	pointer(list, "pointerup", 40, 0.5 * ROW_H);
	await Promise.resolve();

	expect(moveNode).toHaveBeenCalledWith("/tmp/novel", "c2", "f1", null);
});

test("a drag into a gap anchors on the row below it", async () => {
	const { list } = dragging();
	// c2 onto the top edge of the f1 row: before f1, at the root
	pointer(rowAt(list, 2), "pointerdown", 0, 2.5 * ROW_H);
	pointer(list, "pointermove", 0, 0.05 * ROW_H);
	pointer(list, "pointerup", 0, 0.05 * ROW_H);
	await Promise.resolve();

	expect(moveNode).toHaveBeenCalledWith("/tmp/novel", "c2", null, "f1");
});

test("a press that does not travel stays a click", () => {
	const { list } = dragging();
	// Two pixels is inside the threshold, so the folder row's own handler runs
	pointer(rowAt(list, 0), "pointerdown", 40, 10);
	pointer(list, "pointermove", 41, 11);
	pointer(list, "pointerup", 41, 11);

	expect(moveNode).not.toHaveBeenCalled();
	rowAt(list, 0).dispatchEvent(new Event("click", { bubbles: true }));
	expect(store.get("selectedFolder")).toBe("f1");
});

test("the click a drag owes is swallowed", async () => {
	const { list } = dragging();
	// A drag that travels but lands on f1 itself: past the threshold, so the
	// click is owed, but no move, so the rows stay put and row 0 is still f1.
	pointer(rowAt(list, 0), "pointerdown", 40, 0.5 * ROW_H);
	pointer(list, "pointermove", 40, 0.9 * ROW_H);
	pointer(list, "pointerup", 40, 0.9 * ROW_H);
	await Promise.resolve();

	expect(moveNode).not.toHaveBeenCalled();
	// The f1 row selects a folder when clicked, and this click is not one
	rowAt(list, 0).dispatchEvent(new Event("click", { bubbles: true }));
	expect(store.get("selectedFolder")).toBeNull();
});

test("escape abandons a drag without writing anything", async () => {
	const { list } = dragging();
	pointer(rowAt(list, 2), "pointerdown", 40, 2.5 * ROW_H);
	pointer(list, "pointermove", 40, 0.5 * ROW_H);
	window.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
	pointer(list, "pointerup", 40, 0.5 * ROW_H);
	await Promise.resolve();

	expect(moveNode).not.toHaveBeenCalled();
});

// The editor's autosave writes `documents` on a debounce, so this is a real
// race, and a rebuild mid-drag would detach every row we measured.
test("a store change during a drag does not rebuild the list", async () => {
	const { list } = dragging();
	const before = [...list.children];

	pointer(rowAt(list, 2), "pointerdown", 40, 2.5 * ROW_H);
	pointer(list, "pointermove", 40, 0.5 * ROW_H);
	store.set("documents", [doc("c1", "Renamed"), doc("c2", "Loose")]);
	expect([...list.children].slice(0, 3)).toEqual(before);

	pointer(list, "pointerup", 40, 0.5 * ROW_H);
	await Promise.resolve();
	// And the render the guard held back runs once the drag is over
	expect(titles(list.parentElement as HTMLElement)).toContain("▾Part One");
});

test("no drag without a project to persist to", async () => {
	initI18n("en");
	const container = document.createElement("div");
	store.set("documents", [doc("c1", "One"), doc("c2", "Two")]);
	document.body.append(container);
	createSidebar(container);
	const list = layout(container);

	pointer(rowAt(list, 1), "pointerdown", 40, 1.5 * ROW_H);
	pointer(list, "pointermove", 40, 0.1 * ROW_H);
	pointer(list, "pointerup", 40, 0.1 * ROW_H);
	await Promise.resolve();

	expect(moveNode).not.toHaveBeenCalled();
});

test("no drag in a view that says it cannot be reordered", async () => {
	initI18n("en");
	const container = document.createElement("div");
	store.set("projectPath", "/tmp/novel");
	store.set("documents", [doc("c1", "One"), doc("c2", "Two")]);
	store.set(
		"projectMeta",
		meta([
			{ type: "item", id: "c1", kind: "chapter" },
			{ type: "item", id: "c2", kind: "chapter" },
		]),
	);
	document.body.append(container);
	createSidebar(container, {
		id: "read-only",
		reorderable: false,
		label: () => "Read only",
		roots: () => store.get("projectMeta")?.tree ?? [],
		children: (folder) => folder.children,
		item: (node) => doc(node.id, node.id),
	});
	const list = layout(container);

	pointer(rowAt(list, 1), "pointerdown", 40, 1.5 * ROW_H);
	pointer(list, "pointermove", 40, 0.1 * ROW_H);
	pointer(list, "pointerup", 40, 0.1 * ROW_H);
	await Promise.resolve();

	expect(moveNode).not.toHaveBeenCalled();
});
