import { Menu } from "@tauri-apps/api/menu";
import { afterEach, expect, test, vi } from "vitest";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import { getView, setView } from "../../services/config";
import { moveNode } from "../../services/invoke";
import {
	manuscriptProvider,
	type ViewProvider,
	views,
} from "../../services/providers";
import type { Doc, ProjectMeta, TreeNode } from "../../types";
import { createSidebar } from "./sidebar";

// Collapsed folders persist through the Tauri store plugin, which has no
// backend here — and `openStore` only guards the import, not the calls.
vi.mock("../../services/config", () => ({
	getCollapsed: () => Promise.resolve([]),
	setCollapsed: () => Promise.resolve(),
	getView: vi.fn(() => Promise.resolve(null)),
	setView: vi.fn(() => Promise.resolve()),
}));

// The context menu is the real OS menu, which has no backend here. The items
// are what the test reads, and `action` is what it fires — so the item
// constructors hand their options straight back.
const popup = vi.fn(() => Promise.resolve());
const iconItem = vi.fn(async (opts: unknown) => opts);
const plainItem = vi.fn(async (opts: unknown) => opts);
vi.mock("@tauri-apps/api/menu", () => ({
	Menu: { new: vi.fn(() => Promise.resolve({ popup })) },
	// Called through, not passed: `vi.mock` is hoisted above these consts.
	IconMenuItem: { new: (opts: unknown) => iconItem(opts) },
	MenuItem: { new: (opts: unknown) => plainItem(opts) },
	NativeIcon: { Remove: "Remove", RefreshFreestanding: "RefreshFreestanding" },
}));
vi.mock("@tauri-apps/api/image", () => ({
	Image: { new: vi.fn(async () => ({ rid: 1, close: vi.fn() })) },
}));

// happy-dom has no rasterizer: `getContext("2d")` is null and `Path2D` is
// undefined. Without this the icons fall to the no-context branch and the menu
// tests would pass while proving nothing about them.
globalThis.Path2D = class {
	constructor(public d: string) {}
} as unknown as typeof Path2D;
HTMLCanvasElement.prototype.getContext = vi.fn(function (
	this: HTMLCanvasElement,
) {
	return {
		scale: vi.fn(),
		stroke: vi.fn(),
		lineWidth: 0,
		lineCap: "",
		lineJoin: "",
		strokeStyle: "",
		getImageData: (_x: number, _y: number, w: number, h: number) => ({
			data: new Uint8ClampedArray(w * h * 4),
		}),
	};
}) as unknown as HTMLCanvasElement["getContext"];
vi.mock("@tauri-apps/api/dpi", () => ({
	LogicalPosition: class {
		constructor(
			public x: number,
			public y: number,
		) {}
	},
}));

// The sidebar calls this on a drop; nothing else in these tests reaches Tauri.
vi.mock("../../services/invoke", async (actual) => ({
	...(await actual<typeof import("../../services/invoke")>()),
	moveNode: vi.fn(() => Promise.resolve()),
	// Switching to the trash view reads the folder (F-112)
	listTrash: vi.fn(() => Promise.resolve([])),
}));

afterEach(async () => {
	// A drop arms a one-shot click swallow that is disarmed on the next
	// macrotask. Let that window close, or it eats the next test's click.
	await new Promise((resolve) => setTimeout(resolve, 0));
	document.body.replaceChildren();
	vi.mocked(moveNode).mockClear();
	vi.mocked(Menu.new).mockClear();
	menusSeen = 0;
	iconItem.mockClear();
	plainItem.mockClear();
	popup.mockClear();
	store.set("projectMeta", null);
	store.set("projectPath", null);
	store.set("documents", []);
	store.set("activeDoc", null);
	store.set("selectedFolder", null);
	store.set("trash", []);
	store.set("research", []);
	store.set("loadError", null);
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

// Row text, concatenated: a chapter is title + preview + meta, a folder is just
// its title — the caret is an icon and adds no text.
const titles = (container: HTMLElement) =>
	[...(container.querySelector("#doc-list")?.children ?? [])].map(
		(row) => row.textContent,
	);

test("chapters that failed to load say so above the folders", () => {
	initI18n("en");
	const container = document.createElement("div");
	createSidebar(container);

	// The shape of the bug: the tree arrived with open_project, the chapter
	// listing did not, so every item has no document to draw.
	store.set(
		"projectMeta",
		meta([
			{ type: "folder", id: "f1", title: "Part One", children: [] },
			{ type: "item", id: "c1", kind: "chapter" },
		]),
	);
	store.set("loadError", "Failed to parse fulgurita.json");

	const alert = container.querySelector<HTMLElement>('[role="alert"]');
	expect(alert?.textContent).toContain("Chapters could not be loaded");
	// The backend's reason is reachable, not just a generic sentence
	expect(alert?.title).toBe("Failed to parse fulgurita.json");
	expect(titles(container)).toContain("Part One");

	store.set("loadError", null);
	expect(container.querySelector('[role="alert"]')).toBeNull();
});

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
	expect(titles(container)).toEqual(["Part One", "Nestedpm", "Loosepm"]);

	const rows = [...(container.querySelector("#doc-list")?.children ?? [])];
	expect((rows[1] as HTMLElement).style.getPropertyValue("--depth")).toBe("1");
	expect((rows[2] as HTMLElement).style.getPropertyValue("--depth")).toBe("0");

	const toggle = container.querySelector(
		"[aria-expanded]",
	) as HTMLButtonElement;
	expect(toggle.getAttribute("aria-expanded")).toBe("true");
	toggle.click();

	// Collapsed: the chapter inside is gone, the one outside is not
	expect(titles(container)).toEqual(["Part One", "Loosepm"]);
	expect(
		container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded"),
	).toBe("false");
});

test("a click anywhere on a folder row toggles it and takes the selection", () => {
	initI18n("en");
	const container = document.createElement("div");

	store.set("documents", [doc("c1", "Nested")]);
	store.set(
		"projectMeta",
		meta([
			{
				type: "folder",
				id: "f1",
				title: "Part One",
				children: [{ type: "item", id: "c1", kind: "chapter" }],
			},
		]),
	);
	createSidebar(container);

	const row = () =>
		container.querySelector("#doc-list")?.children[0] as HTMLElement;
	const rowCount = () =>
		container.querySelector("#doc-list")?.children.length ?? 0;
	expect(rowCount()).toBe(2);

	// Not the toggle button — the row itself
	row().click();
	expect(rowCount()).toBe(1);
	expect(store.get("selectedFolder")).toBe("f1");

	// And back open, still selected. Two toggles here would mean the button's
	// bubbled click and the row's handler are both firing.
	row().click();
	expect(rowCount()).toBe(2);
	expect(store.get("selectedFolder")).toBe("f1");

	// The caret is inside the row, so it goes through the same one handler
	container.querySelector<HTMLElement>("[aria-expanded]")?.click();
	expect(rowCount()).toBe(1);
});

// --- Right-click menu (F-020) ---

const rightClick = (el: Element) => {
	const e = new MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
		clientX: 40,
		clientY: 40,
	});
	el.dispatchEvent(e);
	return e;
};

let menusSeen = 0;

/** The items handed to the next Menu.new, once its async IPC has settled. */
async function popped() {
	// Building a menu takes a dynamic import per module and an IPC per icon, so
	// how many macrotasks it needs is not ours to know. Waiting for the call
	// rather than for a fixed number of them is what keeps this honest.
	const pending = () => vi.mocked(Menu.new).mock.calls.length <= menusSeen;
	for (let i = 0; i < 50 && pending(); i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	const calls = vi.mocked(Menu.new).mock.calls;
	menusSeen = calls.length;
	const call = calls[calls.length - 1]?.[0];
	return (call?.items ?? []) as { text: string; action: () => void }[];
}

test("right-clicking a chapter offers rename and delete, and emits the id", async () => {
	initI18n("en");
	const container = document.createElement("div");
	store.set("documents", [doc("c1", "One")]);
	store.set("projectMeta", meta([{ type: "item", id: "c1", kind: "chapter" }]));
	createSidebar(container);

	const seen: string[] = [];
	const off = bus.on("document:delete", (id) => seen.push(id));

	const row = rowAt(container.querySelector("#doc-list") as HTMLElement, 0);
	const event = rightClick(row);

	// Cancelled, or the webview stacks its own menu over the native one
	expect(event.defaultPrevented).toBe(true);

	const items = await popped();
	expect(items.map((i) => i.text)).toEqual(["Rename", "Delete chapter"]);

	// A real right-click passes no position — the OS puts it at the cursor
	expect(vi.mocked(popup)).toHaveBeenCalledWith();

	items[1]?.action();
	// The sidebar only says which row went. main.ts owns the flush and the
	// backend call, so nothing here reaches disk.
	expect(seen).toEqual(["c1"]);
	expect(store.get("activeDoc")).toBeNull();
	off();
});

test("a folder's menu deletes the folder, and rename opens the field", async () => {
	initI18n("en");
	const container = document.createElement("div");
	store.set(
		"projectMeta",
		meta([{ type: "folder", id: "f1", title: "Part One", children: [] }]),
	);
	createSidebar(container);

	const seen: string[] = [];
	const off = bus.on("folder:delete", (id) => seen.push(id));

	const list = container.querySelector("#doc-list") as HTMLElement;
	rightClick(rowAt(list, 0));

	const items = await popped();
	expect(items.map((i) => i.text)).toEqual(["Rename", "Delete folder"]);

	items[0]?.action();
	expect(list.querySelector("input")).not.toBeNull();
	expect(seen).toEqual([]);

	rightClick(rowAt(list, 0));
	(await popped())[1]?.action();
	expect(seen).toEqual(["f1"]);
	off();
});

// The other half of `icon` being required on `ViewMenuItem`: that every row
// actually reaches the OS menu carrying one (F-114).
test("every row of the menu is built as an item with an icon", async () => {
	initI18n("en");
	const container = document.createElement("div");
	store.set("documents", [doc("c1", "One")]);
	store.set("projectMeta", meta([{ type: "item", id: "c1", kind: "chapter" }]));
	createSidebar(container);

	rightClick(rowAt(container.querySelector("#doc-list") as HTMLElement, 0));

	expect(await popped()).toHaveLength(2);
	expect(iconItem).toHaveBeenCalledTimes(2);
	for (const [opts] of iconItem.mock.calls) {
		expect(opts).toHaveProperty("icon");
	}
	// The iconless item is the fallback for a canvas that would not open
	expect(plainItem).not.toHaveBeenCalled();
});

// Windows and Linux raise contextmenu from the Menu key and Shift+F10 on their
// own. macOS has neither, so the sidebar raises it rather than leaving keyboard
// users to the platform — and then it has to say where, having no cursor.
test("Shift+F10 opens the menu against the focused row", async () => {
	initI18n("en");
	const container = document.createElement("div");
	store.set("documents", [doc("c1", "One")]);
	store.set("projectMeta", meta([{ type: "item", id: "c1", kind: "chapter" }]));
	// focus() does nothing on a detached node, and Shift+F10 needs a focused row
	document.body.append(container);
	createSidebar(container);

	const list = container.querySelector("#doc-list") as HTMLElement;
	rowAt(list, 0).focus();
	list.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "F10",
			shiftKey: true,
			bubbles: true,
		}),
	);

	expect((await popped()).map((i) => i.text)).toEqual([
		"Rename",
		"Delete chapter",
	]);
	// Positioned, unlike the pointer case
	expect(vi.mocked(popup)).toHaveBeenCalledWith(expect.anything());
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

// --- The trash view (F-112) ---
//
// The second consumer of the provider seam, and the first read-only one.

/** Picks a view in the header menu, the way a writer does. */
function pick(container: HTMLElement, id: string) {
	const select = container.querySelector<HTMLSelectElement>("#view-select");
	if (!select) throw new Error("no view menu");
	select.value = id;
	select.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Opens the trash view with `docs` in it and hands back the container. */
function trashed(docs: Doc[]): HTMLElement {
	initI18n("en");
	const container = document.createElement("div");
	store.set("documents", [doc("c1", "One")]);
	store.set("projectMeta", meta([{ type: "item", id: "c1", kind: "chapter" }]));
	createSidebar(container);

	store.set("trash", docs);
	pick(container, "trash");
	document.body.append(container);
	return container;
}

test("the view menu offers the trash, and it hides the header's actions", () => {
	const container = trashed([doc("t1", "Deleted One")]);

	const options = [
		...(container.querySelectorAll("#view-select option") ?? []),
	].map((o) => o.textContent);
	expect(options).toEqual(["Library", "Research", "Trash"]);
	expect(titles(container)).toEqual(["Deleted Onepm"]);

	// Nothing is written through this view, so there is nothing to add to it
	const hidden = (id: string) =>
		container.querySelector<HTMLElement>(id)?.hidden;
	expect(hidden("#btn-new")).toBe(true);
	expect(hidden("#btn-new-folder")).toBe(true);

	pick(container, "manuscript");
	expect(titles(container)).toEqual(["Onepm"]);
	expect(hidden("#btn-new")).toBe(false);
});

test("the palette reaches the same view menu, and moves it", () => {
	const container = trashed([doc("t1", "Deleted One")]);
	pick(container, "manuscript");

	bus.emit("view:show", "trash");
	expect(titles(container)).toEqual(["Deleted Onepm"]);
	// The menu has to follow, or it names a view that is not the one showing
	expect(
		container.querySelector<HTMLSelectElement>("#view-select")?.value,
	).toBe("trash");

	// An id naming no view leaves what is up alone
	bus.emit("view:show", "codex");
	expect(titles(container)).toEqual(["Deleted Onepm"]);
});

test("a trash row offers restore alone, and emits the id", async () => {
	const container = trashed([doc("t1", "Deleted One")]);

	const seen: string[] = [];
	const off = bus.on("document:restore", (id) => seen.push(id));

	rightClick(rowAt(container.querySelector("#doc-list") as HTMLElement, 0));
	const items = await popped();
	expect(items.map((i) => i.text)).toEqual(["Restore"]);

	items[0]?.action();
	// Same division as a delete: the sidebar says which row, main.ts does it
	expect(seen).toEqual(["t1"]);
	off();
});

// --- The research view (F-106) ---

test("research lists its folder, offers its own actions, and leaves the manuscript's folder alone", () => {
	const container = trashed([]);
	store.set("selectedFolder", "f1");
	store.set("research", [
		{
			type: "folder",
			id: "research/Places",
			title: "Places",
			children: [
				{
					type: "item",
					id: "research/Places/map.png",
					kind: "file",
					title: "map.png",
					url: "",
				},
			],
		},
		{
			type: "item",
			id: "research/Atlas.md",
			kind: "link",
			title: "Atlas",
			url: "https://atlas.test/a",
		},
	]);
	pick(container, "research");

	expect(titles(container)).toEqual([
		"Places",
		"map.pngPNG",
		"Atlasatlas.test",
	]);
	const hidden = (id: string) =>
		container.querySelector<HTMLElement>(id)?.hidden;
	expect(hidden("#btn-new-link")).toBe(false);
	expect(hidden("#btn-show-research")).toBe(false);
	expect(hidden("#btn-new")).toBe(true);

	// The next new chapter lands in the selected folder, and a research folder
	// is not in the manuscript tree to land in
	rowAt(container.querySelector("#doc-list") as HTMLElement, 0).click();
	expect(store.get("selectedFolder")).toBe("f1");

	pick(container, "manuscript");
	expect(hidden("#btn-new-link")).toBe(true);
	expect(hidden("#btn-show-research")).toBe(true);
});

/** The title element of a doc row — `docRow` appends title, preview, meta. */
const dblclickTitle = (row: HTMLElement) =>
	row.firstElementChild?.dispatchEvent(
		new MouseEvent("dblclick", { bubbles: true }),
	);

test("a trash row does not open, and does not rename on a double click", () => {
	const container = trashed([doc("t1", "Deleted One")]);
	const list = container.querySelector("#doc-list") as HTMLElement;

	// `read_chapter` only looks under `chapters/`, so there is nothing to open
	rowAt(list, 0).click();
	expect(store.get("activeDoc")).toBeNull();

	dblclickTitle(rowAt(list, 0));
	expect(rowAt(list, 0).querySelector("input")).toBeNull();

	// The same gesture on the manuscript, to prove it is the view suppressing
	// the rename and not the test missing the element
	pick(container, "manuscript");
	dblclickTitle(rowAt(list, 0));
	expect(rowAt(list, 0).querySelector("input")).not.toBeNull();
});

test("an empty view says so rather than showing a blank pane", () => {
	const container = trashed([]);
	expect(titles(container)).toEqual(["Nothing here"]);
	// Not a row: nothing measures it, focuses it, or opens a menu on it
	expect(container.querySelector("#doc-list [data-id]")).toBeNull();
});

// The seam F-072 buys: the tree draws whatever a provider hands it, and swapping
// the provider swaps the view without the sidebar knowing what changed.
const stub = (id: string, ids: string[]): ViewProvider => ({
	id,
	reorderable: false,
	label: () => `View ${id}`,
	roots: () => ids.map((i) => ({ type: "item", id: i, kind: "chapter" })),
	children: (folder) => folder.children,
	item: (node) => doc(node.id, node.id.toUpperCase()),
	menu: () => [],
	open: () => {},
});

test("setProvider swaps the rendered nodes", () => {
	initI18n("en");
	const container = document.createElement("div");

	const sidebar = createSidebar(container, stub("a", ["c1"]));
	expect(titles(container)).toEqual(["C1pm"]);

	sidebar.setProvider(stub("b", ["c2", "c3"]));
	expect(titles(container)).toEqual(["C2pm", "C3pm"]);
});

// --- View switcher, the view selector (F-073) ---

test("the selector lists the registered views and opens on the first", () => {
	initI18n("en");
	const container = document.createElement("div");
	createSidebar(container);

	const select = container.querySelector("select") as HTMLSelectElement;
	expect([...select.options].map((o) => o.value)).toEqual(
		views.map((v) => v.id),
	);
	expect([...select.options].map((o) => o.textContent)).toEqual(
		views.map((v) => v.label()),
	);
	expect(select.value).toBe(manuscriptProvider.id);
});

// The registry has one real view until F-074, so these register a stub second
// one and take it back out again.
test("picking a view renders it, remembers it, and keeps the selection", () => {
	initI18n("en");
	store.set("documents", [doc("c1", "One"), doc("c2", "Two")]);
	store.set("activeDoc", doc("c2", "Two"));
	views.push(stub("other", ["c1"]));

	const container = document.createElement("div");
	createSidebar(container);
	const select = container.querySelector("select") as HTMLSelectElement;
	select.value = "other";
	select.dispatchEvent(new Event("change"));

	expect(titles(container)).toEqual(["C1pm"]);
	expect(setView).toHaveBeenCalledWith("other");
	// The chapter that was open is still the open one: a view swap is a change
	// of angle, not of place.
	expect(store.get("activeDoc")?.id).toBe("c2");

	views.pop();
});

test("the persisted view is the one the sidebar opens on", async () => {
	initI18n("en");
	store.set("documents", [doc("c1", "One")]);
	views.push(stub("saved", ["c1"]));
	vi.mocked(getView).mockResolvedValueOnce("saved");

	const container = document.createElement("div");
	createSidebar(container);
	const select = container.querySelector("select") as HTMLSelectElement;
	await vi.waitFor(() => expect(select.value).toBe("saved"));

	views.pop();
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
	expect(titles(list.parentElement as HTMLElement)).toContain("Part One");
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
		menu: () => [],
		open: () => {},
	});
	const list = layout(container);

	pointer(rowAt(list, 1), "pointerdown", 40, 1.5 * ROW_H);
	pointer(list, "pointermove", 40, 0.1 * ROW_H);
	pointer(list, "pointerup", 40, 0.1 * ROW_H);
	await Promise.resolve();

	expect(moveNode).not.toHaveBeenCalled();
});

// --- Keyboard reordering ---

const key = (el: Element, k: string, alt = false) =>
	el.dispatchEvent(
		new KeyboardEvent("keydown", { key: k, altKey: alt, bubbles: true }),
	);

test("the list holds one tab stop, and it follows the focused row", () => {
	const { list } = dragging();
	expect(
		[...list.children].map((row) => (row as HTMLElement).tabIndex),
	).toEqual([0, -1, -1]);

	rowAt(list, 2).focus();
	expect(
		[...list.children].map((row) => (row as HTMLElement).tabIndex),
	).toEqual([-1, -1, 0]);
});

test("a bare arrow walks the rows and moves nothing", () => {
	const { list } = dragging();
	rowAt(list, 0).focus();
	key(rowAt(list, 0), "ArrowDown");

	expect(document.activeElement).toBe(rowAt(list, 1));
	expect(moveNode).not.toHaveBeenCalled();
});

test("alt with an arrow moves the focused node", async () => {
	const { list } = dragging();
	// c2 is the last row and second at the root, so up steps over f1
	rowAt(list, 2).focus();
	key(rowAt(list, 2), "ArrowUp", true);
	await Promise.resolve();

	expect(moveNode).toHaveBeenCalledWith("/tmp/novel", "c2", null, "f1");
});

test("alt-right indents into the folder above", async () => {
	const { list } = dragging();
	rowAt(list, 2).focus();
	key(rowAt(list, 2), "ArrowRight", true);
	await Promise.resolve();

	expect(moveNode).toHaveBeenCalledWith("/tmp/novel", "c2", "f1", null);
});

test("a keyboard move keeps focus on the node and says where it went", async () => {
	const { container, list } = dragging();
	rowAt(list, 2).focus();
	key(rowAt(list, 2), "ArrowUp", true);
	await Promise.resolve();

	// The rerender rebuilt every row, so this is the new element for c2
	expect((document.activeElement as HTMLElement)?.dataset.id).toBe("c2");
	expect(container.querySelector("#tree-live")?.textContent).toBe(
		"Moved Loose to 1 of 2 in the top level",
	);
});

test("no keyboard move without a project to persist to", async () => {
	initI18n("en");
	const container = document.createElement("div");
	store.set("documents", [doc("c1", "One"), doc("c2", "Two")]);
	document.body.append(container);
	createSidebar(container);
	const list = layout(container);

	rowAt(list, 1).focus();
	key(rowAt(list, 1), "ArrowUp", true);
	await Promise.resolve();

	expect(moveNode).not.toHaveBeenCalled();
});

// Pointer capture retargets the compatibility mouse events, so holding it from
// pointerdown sends the click to the list and the row never opens. happy-dom
// does not retarget, so only the capture itself can be asserted here.
test("an ordinary press never captures the pointer", () => {
	const { list } = dragging();
	pointer(rowAt(list, 0), "pointerdown", 40, 0.5 * ROW_H);
	expect(list.hasPointerCapture(1)).toBe(false);
	pointer(list, "pointerup", 40, 0.5 * ROW_H);
	expect(list.hasPointerCapture(1)).toBe(false);
});

test("a drag takes the pointer only once it has started, and gives it back", () => {
	const { list } = dragging();
	pointer(rowAt(list, 2), "pointerdown", 40, 2.5 * ROW_H);
	expect(list.hasPointerCapture(1)).toBe(false);

	pointer(list, "pointermove", 40, 0.5 * ROW_H);
	expect(list.hasPointerCapture(1)).toBe(true);

	pointer(list, "pointerup", 40, 0.5 * ROW_H);
	expect(list.hasPointerCapture(1)).toBe(false);
});

test("a press hands the row to the keyboard", async () => {
	const { list } = dragging();
	// No focus() call: WebKit does not focus a div on a click, so the press has
	// to do it or Alt with an arrow has nothing to move.
	pointer(rowAt(list, 2), "pointerdown", 40, 2.5 * ROW_H);
	pointer(list, "pointerup", 40, 2.5 * ROW_H);
	key(rowAt(list, 2), "ArrowUp", true);
	await Promise.resolve();

	expect(moveNode).toHaveBeenCalledWith("/tmp/novel", "c2", null, "f1");
});

// The header's add buttons are the same control as the titlebar's: one stroked
// icon in the shared icon box, named by aria-label rather than by a glyph.
test("the header's add buttons draw one hidden icon and keep their names", () => {
	initI18n("en");
	const container = document.createElement("div");
	createSidebar(container);

	for (const id of ["#btn-new", "#btn-new-folder"]) {
		const button = container.querySelector<HTMLButtonElement>(id);
		expect(button?.classList.contains("btn-icon")).toBe(true);
		expect(button?.querySelectorAll("svg")).toHaveLength(1);
		expect(button?.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
			"true",
		);
		expect(button?.textContent).toBe("");
		expect(button?.getAttribute("aria-label")).toBeTruthy();
	}
});
