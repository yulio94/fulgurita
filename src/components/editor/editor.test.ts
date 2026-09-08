import { beforeEach, expect, test, vi } from "vitest";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { ChapterMeta, Doc } from "../../types";

const saveChapter = vi.hoisted(() => vi.fn());
const renameChapter = vi.hoisted(() => vi.fn());
// services/chapters.ts pulls from the same module id, so the factory has to cover
// every named export reachable from the editor, not just the one under test.
vi.mock("../../services/invoke", () => ({
	saveChapter,
	renameChapter,
	readChapter: vi.fn(),
}));

const { createEditor } = await import("./editor");

const DOC: Doc = {
	id: "ch-1",
	title: "Chapter One",
	type: "chapter",
	language: "en",
	tags: [],
	synopsis: "",
	content: "<p>The spice must flow.</p>",
	words: 4,
	preview: "",
	meta: "",
	notes: "",
	createdAt: new Date(),
	updatedAt: new Date(),
};

const META: ChapterMeta = {
	id: "ch-1",
	title: "Chapter One",
	type: "chapter",
	language: "en",
	tags: [],
	synopsis: "",
	pov: "",
	word_count: 4,
	modified: new Date().toISOString(),
};

// One mount for the file: bus and store are module singletons, so a second editor
// would answer the same `document:save` and double every write.
initI18n("en");
const container = document.createElement("div");
const { flush } = createEditor(container);

/** Toggling a list is a real document change, so onUpdate fires and marks dirty. */
function edit() {
	const bulletList = container.querySelector<HTMLButtonElement>(
		'[aria-label="Bullet list"]',
	);
	if (!bulletList) throw new Error("bullet list button missing");
	bulletList.click();
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	vi.clearAllMocks();
	saveChapter.mockResolvedValue(META);
	store.set("projectPath", "/tmp/project");
	store.set("activeDoc", DOC);
	store.set("documents", [DOC]);
	store.set("saveState", "saved");
	// Resets the body and clears the dirty flag
	bus.emit("document:load", DOC);
});

// F-021 shipped rename against the sidebar and the toolbar, but the toolbar only
// wrote its field on document:load. Renaming from the sidebar moves activeDoc
// without reloading, so the field kept the old title until you left the chapter
// and came back.
test("a rename from the sidebar reaches the toolbar title", () => {
	const title = () =>
		container.querySelector<HTMLInputElement>('[aria-label="Chapter title"]')
			?.value;

	expect(title()).toBe("Chapter One");

	// What commitRename does once the backend has answered
	store.set("activeDoc", { ...DOC, title: "El despertar" });

	expect(title()).toBe("El despertar");
});

// The whole point of F-008 is that work survives. persist() clears the dirty flag
// before awaiting the write, so a rejected save used to leave the editor thinking
// it was clean — the edit was gone with nothing to retry and nothing on screen.
test("a failed save keeps the edit and retries it on the next flush", async () => {
	saveChapter.mockRejectedValueOnce(new Error("Failed to write chapter file"));
	edit();
	await flush();

	expect(saveChapter).toHaveBeenCalledTimes(1);
	expect(store.get("saveState")).toBe("error");

	await flush();

	expect(store.get("saveState")).toBe("saved");
	expect(saveChapter).toHaveBeenCalledTimes(2);
	// Same body both times: the failure did not eat the edit
	const [first, second] = saveChapter.mock.calls;
	expect(second[2]).toBe(first[2]);
	expect(second[2]).toContain("-   The spice must flow.");
});

// save_chapter reads the file then rewrites it, so two overlapping writes can land
// out of order and persist the stale body. The close flush must also wait for the
// write already in the air, not just the one it starts.
test("a flush waits for the write already in the air", async () => {
	let release: ((meta: ChapterMeta) => void) | undefined;
	saveChapter.mockImplementationOnce(
		() =>
			new Promise<ChapterMeta>((resolve) => {
				release = resolve;
			}),
	);

	edit();
	void flush(); // starts the first write and hangs it
	await tick();
	expect(saveChapter).toHaveBeenCalledTimes(1);
	// The indicator reaches "saving" — a local write just returns too fast to see it
	expect(store.get("saveState")).toBe("saving");

	edit(); // dirty again while the first write is still out
	let settled = false;
	const second = flush().then(() => {
		settled = true;
	});
	await tick();

	// Queued behind the first, not racing it
	expect(saveChapter).toHaveBeenCalledTimes(1);
	expect(settled).toBe(false);

	release?.(META);
	await second;

	expect(saveChapter).toHaveBeenCalledTimes(2);
	expect(settled).toBe(true);
});

// A flush with nothing pending must not write, or every chapter switch would
// rewrite an untouched file and churn its modified time.
test("flushing a clean editor does not write", async () => {
	await flush();

	expect(saveChapter).not.toHaveBeenCalled();
	expect(store.get("saveState")).toBe("saved");
});

// Cmd+S on an untouched chapter used to be completely inert: persist() returned
// before touching saveState, so the status bar never moved and the writer got no
// answer at all.
test("an explicit save confirms even with nothing to write", async () => {
	const seen = vi.fn();
	const off = store.on("saveState", seen);

	bus.emit("document:save");
	await tick();
	off();

	expect(saveChapter).not.toHaveBeenCalled();
	expect(seen).toHaveBeenCalledWith("saved");
});

// The title grew past the measure, so it became a textarea to wrap instead of
// clipping. A textarea answers Enter with a newline and only fires `change` on
// blur, so both had to be taken over by hand.
test("Enter commits the title instead of breaking the line", async () => {
	const field = container.querySelector<HTMLTextAreaElement>(
		'[aria-label="Chapter title"]',
	);
	if (!field) throw new Error("chapter title missing");

	// commitRename reads the meta the backend answers with, so the mock has to
	// answer with one.
	renameChapter.mockResolvedValue({ ...META, title: "El despertar" });

	const changes: string[] = [];
	field.addEventListener("change", () => changes.push(field.value));

	field.value = "El despertar";
	field.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
	);
	await tick();

	expect(changes).toEqual(["El despertar"]);
	// The newline never lands, so the field stays one title rather than two lines
	expect(field.value).not.toContain("\n");
});
