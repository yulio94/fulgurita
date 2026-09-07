import type { StoreState } from "../types";

type Listener<T> = (value: T) => void;

const defaultState: StoreState = {
	documents: [],
	activeDoc: null,
	stats: { words: 0, characters: 0, paragraphs: 0, readingTime: "0 min" },
	outline: [],
	theme: "light",
	sidebarOpen: true,
	inspectorOpen: true,
	focusMode: false,
	dailyGoal: 1000,
	locale: "en",
	projectMeta: null,
	projectPath: null,
	selectedFolder: null,
	sidebarView: "manuscript",
	trash: [],
	saveState: "saved",
	saveError: null,
};

class Store {
	private state: StoreState;
	private listeners = new Map<string, Set<Listener<unknown>>>();

	constructor() {
		this.state = { ...defaultState };
	}

	get<K extends keyof StoreState>(key: K): StoreState[K] {
		return this.state[key];
	}

	set<K extends keyof StoreState>(key: K, value: StoreState[K]): void {
		this.state[key] = value;
		this.notify(key);
	}

	/**
	 * Subscribes to a key and returns an unsubscribe.
	 *
	 * Listeners only fire on change, so a subscriber that mounts after the value
	 * was set never sees it. `immediate` runs the callback once with what is
	 * already there, which is what a component wants whenever it renders from the
	 * key rather than merely reacting to it.
	 */
	on<K extends keyof StoreState>(
		key: K,
		callback: Listener<StoreState[K]>,
		options?: { immediate?: boolean },
	): () => void {
		if (!this.listeners.has(key)) {
			this.listeners.set(key, new Set());
		}
		const set = this.listeners.get(key);
		if (!set) return () => {};
		set.add(callback as Listener<unknown>);
		if (options?.immediate) callback(this.state[key]);
		return () => set.delete(callback as Listener<unknown>);
	}

	private notify<K extends keyof StoreState>(key: K): void {
		const set = this.listeners.get(key);
		if (set) {
			const value = this.state[key];
			for (const cb of set) {
				cb(value);
			}
		}
	}
}

export const store = new Store();
