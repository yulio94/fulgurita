import { store } from "../core/store";
import type { Config, ConfigKeys } from "../types";

const DEFAULTS: Config = {
	theme: "light",
	sidebarOpen: true,
	inspectorOpen: true,
	focusMode: false,
	typewriter: false,
	dailyGoal: 1000,
	locale: "en",
	sidebarWidth: 240,
	inspectorWidth: 260,
};

/** Keys from the reactive store that are auto-persisted on change. */
const STORE_KEYS: ConfigKeys[] = [
	"theme",
	"sidebarOpen",
	"inspectorOpen",
	"focusMode",
	"typewriter",
	"dailyGoal",
	"locale",
];

type LazyStore = {
	get<T>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown): Promise<void>;
	save(): Promise<void>;
};

let lazyStore: LazyStore | null = null;

async function openStore(): Promise<LazyStore | null> {
	if (lazyStore) return lazyStore;
	try {
		const { LazyStore } = await import("@tauri-apps/plugin-store");
		lazyStore = new LazyStore("config.json");
		return lazyStore;
	} catch {
		// Not running in Tauri (browser-only dev) — persistence unavailable
		return null;
	}
}

/**
 * Load persisted config, push values into the reactive store,
 * and subscribe to future changes for auto-persist.
 */
export async function loadConfig(): Promise<Config> {
	const config = { ...DEFAULTS };
	const tauriStore = await openStore();

	if (tauriStore) {
		// Read persisted values, falling back to defaults for missing keys
		for (const key of STORE_KEYS) {
			const value = await tauriStore.get<(typeof config)[typeof key]>(key);
			if (value !== undefined) {
				(config as Record<string, unknown>)[key] = value;
			}
		}

		const sw = await tauriStore.get<number>("sidebarWidth");
		if (sw !== undefined) config.sidebarWidth = sw;

		const iw = await tauriStore.get<number>("inspectorWidth");
		if (iw !== undefined) config.inspectorWidth = iw;
	}

	// Push persisted values into the reactive store
	for (const key of STORE_KEYS) {
		store.set(key, config[key] as never);
	}

	// Subscribe to future store changes for auto-persist
	if (tauriStore) {
		for (const key of STORE_KEYS) {
			store.on(key, async (value) => {
				await tauriStore.set(key, value);
				await tauriStore.save();
			});
		}
	}

	return config;
}

/**
 * Persist panel widths — called by split-panels on drag end.
 */
export async function persistPanelWidths(
	sidebarWidth: number,
	inspectorWidth: number,
): Promise<void> {
	const tauriStore = await openStore();
	if (!tauriStore) return;
	await tauriStore.set("sidebarWidth", sidebarWidth);
	await tauriStore.set("inspectorWidth", inspectorWidth);
	await tauriStore.save();
}

/**
 * Folder ids the user has collapsed, keyed by project path. Folders default to
 * open, so the usual case stores an empty array.
 *
 * ponytail: the key of a project that has been deleted or moved is never pruned.
 * It is one path and a few ids. Prune it when a project is removed from recents,
 * if that ever matters.
 */
export async function getCollapsed(projectPath: string): Promise<string[]> {
	const tauriStore = await openStore();
	if (!tauriStore) return [];
	const all = await tauriStore.get<Record<string, string[]>>("collapsed");
	return all?.[projectPath] ?? [];
}

export async function setCollapsed(
	projectPath: string,
	ids: string[],
): Promise<void> {
	const tauriStore = await openStore();
	if (!tauriStore) return;
	const all =
		(await tauriStore.get<Record<string, string[]>>("collapsed")) ?? {};
	await tauriStore.set("collapsed", { ...all, [projectPath]: ids });
	await tauriStore.save();
}

/** A project the user has opened before, surfaced on the start screen. */
export interface Recent {
	path: string;
	name: string;
	opened: string;
}

const RECENTS_LIMIT = 10;

/** Newest first, deduped by path, capped at RECENTS_LIMIT. */
export function upsertRecent(list: Recent[], entry: Recent): Recent[] {
	return [entry, ...list.filter((r) => r.path !== entry.path)].slice(
		0,
		RECENTS_LIMIT,
	);
}

// ponytail: entries are pruned when opening one fails, not validated on read.
// Swap in a Rust fs check if a native "Open Recent" menu ever needs a clean list.
export async function getRecents(): Promise<Recent[]> {
	const tauriStore = await openStore();
	if (!tauriStore) return [];
	return (await tauriStore.get<Recent[]>("recents")) ?? [];
}

export async function addRecent(path: string, name: string): Promise<void> {
	const tauriStore = await openStore();
	if (!tauriStore) return;
	const list = upsertRecent(await getRecents(), {
		path,
		name,
		opened: new Date().toISOString(),
	});
	await tauriStore.set("recents", list);
	await tauriStore.save();
}

export async function removeRecent(path: string): Promise<void> {
	const tauriStore = await openStore();
	if (!tauriStore) return;
	const list = (await getRecents()).filter((r) => r.path !== path);
	await tauriStore.set("recents", list);
	await tauriStore.save();
}

/**
 * The sidebar view last picked, by provider id. One global key rather than one
 * per project like `collapsed`: which angle you read a manuscript from is a
 * habit of the writer, not a property of the project.
 */
export async function getView(): Promise<string | null> {
	const tauriStore = await openStore();
	if (!tauriStore) return null;
	return (await tauriStore.get<string>("view")) ?? null;
}

export async function setView(id: string): Promise<void> {
	const tauriStore = await openStore();
	if (!tauriStore) return;
	await tauriStore.set("view", id);
	await tauriStore.save();
}
