import { beforeEach, expect, test, vi } from "vitest";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import type { ProjectMeta } from "../../types";

const setProjectLanguage = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm }));
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
	trash: [],
	tree: [{ type: "item", id: "c1", kind: "chapter" }],
});

/** Opens the modal and hands back the project language select and the card. */
function openSettings() {
	bus.emit("settings:open");
	const select =
		document.querySelector<HTMLSelectElement>("#settings-language");
	if (!select) throw new Error("the modal did not open");
	// The card, not the select's parent: the select sits inside a section now,
	// and errors are appended to the card below every section.
	return { select, card: card() };
}

/** The open modal's card. Throws rather than returning null, like openSettings. */
function card(): HTMLElement {
	const el = document.querySelector<HTMLElement>(".modal-card");
	if (!el) throw new Error("the modal did not open");
	return el;
}

const pick = (select: HTMLSelectElement, value: string) => {
	select.value = value;
	select.dispatchEvent(new Event("change"));
};

// `bubbles`, because the listener is on the card and not on any one field —
// with three fields, hanging Escape off one of them only half works.
const pressEscape = (el: HTMLElement) =>
	el.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);

beforeEach(() => {
	// The module owns one overlay, so a test that left it open has to close it
	// through the real path — removing the node behind its back wedges the guard.
	// Keyed on the card, not on a field: the no-project modal has no project one.
	const stale = document.querySelector<HTMLElement>(".modal-card");
	if (stale) pressEscape(stale);
	vi.clearAllMocks();
	setProjectLanguage.mockImplementation(async (_p: string, l: string) => l);
	// Declining by default, so only the tests that care about restarting see it
	confirm.mockResolvedValue(false);
	store.set("projectPath", "/tmp/la-hija");
	store.set("projectMeta", meta("es"));
	store.set("locale", "en");
	store.set("dailyGoal", 1000);
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

test("with no project open, only the application section is there", () => {
	store.set("projectMeta", null);
	store.set("projectPath", null);
	bus.emit("settings:open");

	// The reason Cmd+, is worth having on the start screen at all
	expect(document.querySelector("#settings-app-language")).not.toBeNull();
	expect(document.querySelector("#settings-language")).toBeNull();
	expect(card().textContent).not.toContain("Project");
});

test("a goal below the floor is clamped before it reaches the store", () => {
	openSettings();
	const goal = document.querySelector<HTMLInputElement>("#settings-daily-goal");
	if (!goal) throw new Error("no goal field");

	// `min` does not stop anyone typing this, and statusbar.ts divides by it
	goal.value = "0";
	goal.dispatchEvent(new Event("change"));

	expect(store.get("dailyGoal")).toBe(50);
	expect(goal.value).toBe("50");
});

test("a goal that is not a number leaves the stored one alone", () => {
	store.set("dailyGoal", 800);
	openSettings();
	const goal = document.querySelector<HTMLInputElement>("#settings-daily-goal");
	if (!goal) throw new Error("no goal field");

	goal.value = "";
	goal.dispatchEvent(new Event("change"));

	expect(store.get("dailyGoal")).toBe(800);
});

test("the interface language persists but does not relabel what is mounted", () => {
	const { card } = openSettings();
	const appLang = document.querySelector<HTMLSelectElement>(
		"#settings-app-language",
	);
	if (!appLang) throw new Error("no interface language field");

	pick(appLang, "es");

	expect(store.get("locale")).toBe("es");
	// Still English: config.ts persists this and main.ts applies it at boot. A
	// live switch would mean rebuilding every component that read its strings at
	// construction, which is the trade the hint under this field describes.
	expect(card.textContent).toContain("Settings");
	expect(card.textContent).not.toContain("Ajustes");
});

test("changing the interface language says a restart is owed", () => {
	const { card } = openSettings();
	const appLang = document.querySelector<HTMLSelectElement>(
		"#settings-app-language",
	);
	if (!appLang) throw new Error("no interface language field");
	expect(card.textContent).not.toContain("Restart Sietch");

	pick(appLang, "es");

	// The whole complaint this covers: the field changes and nothing says why
	// the app still looks the same.
	expect(card.textContent).toContain("Restart Sietch");
});

test("the restart notice survives closing and reopening the window", () => {
	const first = openSettings();
	const appLang = document.querySelector<HTMLSelectElement>(
		"#settings-app-language",
	);
	if (!appLang) throw new Error("no interface language field");
	pick(appLang, "es");
	pressEscape(first.card);

	// Stored is "es", mounted is still English, so the restart is still owed —
	// comparing against the stored value would wrongly call this settled.
	expect(openSettings().card.textContent).toContain("Restart Sietch");
});

test("picking the running language back puts the notice away", () => {
	const { card } = openSettings();
	const appLang = document.querySelector<HTMLSelectElement>(
		"#settings-app-language",
	);
	if (!appLang) throw new Error("no interface language field");

	pick(appLang, "es");
	pick(appLang, "en");

	expect(card.textContent).not.toContain("Restart Sietch");
	expect(card.textContent).toContain("Applies the next time");
});

test("closing after a language change offers a restart", async () => {
	const restarts = vi.fn();
	const off = bus.on("app:restart", restarts);
	confirm.mockResolvedValue(true);
	const { card } = openSettings();
	const appLang = document.querySelector<HTMLSelectElement>(
		"#settings-app-language",
	);
	if (!appLang) throw new Error("no interface language field");

	pick(appLang, "es");
	pressEscape(card);

	// Asked after the card is gone, not over it
	await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
	await vi.waitFor(() => expect(restarts).toHaveBeenCalled());
	off();
});

test("declining the restart leaves the choice persisted", async () => {
	const restarts = vi.fn();
	const off = bus.on("app:restart", restarts);
	const { card } = openSettings();
	const appLang = document.querySelector<HTMLSelectElement>(
		"#settings-app-language",
	);
	if (!appLang) throw new Error("no interface language field");

	pick(appLang, "es");
	pressEscape(card);

	await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
	expect(restarts).not.toHaveBeenCalled();
	// The point of "Later": the next launch still comes up in Spanish
	expect(store.get("locale")).toBe("es");
	off();
});

test("closing without touching the language asks nothing", async () => {
	const { card } = openSettings();
	const goal = document.querySelector<HTMLInputElement>("#settings-daily-goal");
	if (!goal) throw new Error("no goal field");

	goal.value = "300";
	goal.dispatchEvent(new Event("change"));
	pressEscape(card);

	await Promise.resolve();
	expect(confirm).not.toHaveBeenCalled();
});

test("a restart owed by an earlier session does not re-ask on every close", async () => {
	// Change it, close (asked once), reopen for something else, close again
	const first = openSettings();
	const appLang = document.querySelector<HTMLSelectElement>(
		"#settings-app-language",
	);
	if (!appLang) throw new Error("no interface language field");
	pick(appLang, "es");
	pressEscape(first.card);
	await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));

	const second = openSettings();
	// The standing notice is still there — it is the nagging that is gone
	expect(second.card.textContent).toContain("Restart Sietch");
	pressEscape(second.card);

	await Promise.resolve();
	expect(confirm).toHaveBeenCalledTimes(1);
});
