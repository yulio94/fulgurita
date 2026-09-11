import { beforeEach, expect, test, vi } from "vitest";
import { initI18n } from "../../i18n";
import type { Recent } from "../../services/config";

const recents = vi.hoisted(() => ({ list: [] as Recent[] }));

vi.mock("../../services/config", () => ({
	getRecents: async () => recents.list,
	addRecent: vi.fn(),
	removeRecent: vi.fn(async (path: string) => {
		recents.list = recents.list.filter((r) => r.path !== path);
	}),
}));

const openProject = vi.hoisted(() => vi.fn());
const createProject = vi.hoisted(() => vi.fn());
vi.mock("../../services/invoke", () => ({
	openProject,
	createProject,
}));
const pickFolder = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: pickFolder }));

const { createStartScreen } = await import("./start-screen");
const { removeRecent } = await import("../../services/config");
const { store } = await import("../../core/store");

const at = (path: string, name: string): Recent => ({
	path,
	name,
	opened: new Date().toISOString(),
});

beforeEach(() => {
	initI18n("en");
	vi.clearAllMocks();
	recents.list = [at("/tmp/one", "One"), at("/tmp/two", "Two")];
});

/** Flush the microtask queue so the async renderRecents() settles. */
const settle = () => new Promise((r) => setTimeout(r, 0));

test("recent projects render, newest first, as text", async () => {
	const container = document.createElement("div");
	createStartScreen(container);
	await settle();

	const names = [...container.querySelectorAll("button[type=button] span")]
		.map((el) => el.textContent)
		.filter((t) => t === "One" || t === "Two");
	expect(names).toEqual(["One", "Two"]);
});

test("a project name with markup renders inert, never as live DOM", async () => {
	recents.list = [at("/tmp/x", '<img src=x onerror="alert(1)">')];
	const container = document.createElement("div");
	createStartScreen(container);
	await settle();

	expect(container.querySelector("img")).toBeNull();
	expect(container.textContent).toContain("<img src=x");
});

test("opening a project whose folder is gone drops it from the list", async () => {
	openProject.mockRejectedValue("fulgurita.json not found");
	const container = document.createElement("div");
	createStartScreen(container);
	await settle();

	const openBtn = container.querySelector("button[type=button]") as HTMLElement;
	openBtn.click();
	await settle();

	expect(removeRecent).toHaveBeenCalledWith("/tmp/one");
	expect(container.textContent).not.toContain("One");
	expect(container.textContent).toContain("Two");
});

test("opening a project hands over the app locale, so a legacy one is backfilled", async () => {
	// fulgurita.json predating `language` gets whatever we pass. Without it every
	// chapter of a Spanish manuscript is stamped `en`.
	store.set("locale", "es");
	openProject.mockResolvedValue({ name: "One", language: "es", tree: [] });
	const container = document.createElement("div");
	createStartScreen(container);
	await settle();

	(container.querySelector("button[type=button]") as HTMLElement).click();
	await settle();

	expect(openProject).toHaveBeenCalledWith("/tmp/one", "es");
});

test("a project is created in the language picked in the modal, not the app's", async () => {
	store.set("locale", "en");
	pickFolder.mockResolvedValue("/tmp/novels");
	createProject.mockResolvedValue({
		name: "La hija",
		language: "es",
		tree: [],
	});
	const container = document.createElement("div");
	createStartScreen(container);
	await settle();

	const create = [...container.querySelectorAll("button")].find(
		(b) => b.textContent === "Create Project",
	) as HTMLElement;
	create.click();
	await settle();

	const name = document.querySelector(
		".input, input[type=text]",
	) as HTMLInputElement;
	name.value = "La hija";
	const language = document.querySelector(
		"#new-project-language",
	) as HTMLSelectElement;
	language.value = "es";

	const confirm = [...document.querySelectorAll("button")].find(
		(b) => b.textContent === "Create",
	) as HTMLElement;
	confirm.click();
	await settle();

	expect(createProject).toHaveBeenCalledWith("La hija", "/tmp/novels", "es");
});
