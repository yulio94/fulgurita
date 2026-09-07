import { beforeEach, expect, test, vi } from "vitest";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { ProjectMeta } from "../../types";

const setProjectLanguage = vi.hoisted(() => vi.fn());
// The module graph reaches services/invoke for more than the one under test, so
// the factory has to cover every named export it pulls.
vi.mock("../../services/invoke", () => ({
	setProjectLanguage,
	readChapter: vi.fn(),
	renameChapter: vi.fn(),
}));

const { createSettings } = await import("./settings");

initI18n("en");
createSettings();

const meta = (language: string): ProjectMeta => ({
	name: "La hija",
	author: "",
	created: "2025-01-01T00:00:00Z",
	modified: "2025-01-01T00:00:00Z",
	version: "1.0.0",
	format_version: 1,
	language,
	tree: [{ type: "item", id: "c1", kind: "chapter" }],
});

/** Opens the modal and hands back the select and its card. */
function openSettings() {
	bus.emit("settings:open");
	const select =
		document.querySelector<HTMLSelectElement>("#settings-language");
	if (!select) throw new Error("the modal did not open");
	return { select, card: select.parentElement as HTMLElement };
}

const pick = (select: HTMLSelectElement, value: string) => {
	select.value = value;
	select.dispatchEvent(new Event("change"));
};

const pressEscape = (el: HTMLElement) =>
	el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

beforeEach(() => {
	// The module owns one overlay, so a test that left it open has to close it
	// through the real path — removing the node behind its back wedges the guard.
	const stale = document.querySelector<HTMLSelectElement>("#settings-language");
	if (stale) pressEscape(stale);
	vi.clearAllMocks();
	setProjectLanguage.mockImplementation(async (_p: string, l: string) => l);
	store.set("projectPath", "/tmp/la-hija");
	store.set("projectMeta", meta("es"));
	store.set("locale", "en");
});

test("the select shows the project's language, not the app's", () => {
	// The whole point: menus in English, manuscript in Spanish
	const { select } = openSettings();

	expect(select.value).toBe("es");
});

test("choosing a language writes it and patches the store in place", async () => {
	const before = store.get("projectMeta") as ProjectMeta;
	const { select } = openSettings();

	pick(select, "en");
	await vi.waitFor(() => {
		expect((store.get("projectMeta") as ProjectMeta).language).toBe("en");
	});

	expect(setProjectLanguage).toHaveBeenCalledWith("/tmp/la-hija", "en");
	// The tree came from open_project, which pruned orphans in memory. Carrying
	// the same array over is what keeps a re-read from restoring them in the
	// sidebar, which rebuilds on every projectMeta set.
	expect((store.get("projectMeta") as ProjectMeta).tree).toBe(before.tree);
});

test("a refused write puts the select back and says why", async () => {
	setProjectLanguage.mockRejectedValue("Project language cannot be empty.");
	const { select, card } = openSettings();

	pick(select, "en");
	await vi.waitFor(() => {
		expect(select.value).toBe("es");
	});

	expect((store.get("projectMeta") as ProjectMeta).language).toBe("es");
	expect(card.textContent).toContain("Project language cannot be empty.");
});

test("escape closes it, and it reopens", () => {
	const { select } = openSettings();

	pressEscape(select);
	expect(document.querySelector("#settings-language")).toBeNull();

	expect(openSettings().select.value).toBe("es");
});
