import { expect, test } from "vitest";
import { store } from "./store";

// Listeners fire on change, so a component that mounted after loadConfig had
// already filled the store never saw its own key. That is how the sidebar
// reopened on every launch with its closed state sitting in the store unread.
test("an immediate subscriber sees the value already in the store", () => {
	store.set("dailyGoal", 2500);

	const seen: number[] = [];
	const off = store.on("dailyGoal", (goal) => seen.push(goal), {
		immediate: true,
	});
	expect(seen).toEqual([2500]);

	store.set("dailyGoal", 3000);
	expect(seen).toEqual([2500, 3000]);

	// Unsubscribing still works
	off();
	store.set("dailyGoal", 4000);
	expect(seen).toEqual([2500, 3000]);
});

test("a plain subscriber only hears about changes", () => {
	store.set("dailyGoal", 1000);

	const seen: number[] = [];
	const off = store.on("dailyGoal", (goal) => seen.push(goal));
	expect(seen).toEqual([]);

	store.set("dailyGoal", 1200);
	expect(seen).toEqual([1200]);
	off();
});
