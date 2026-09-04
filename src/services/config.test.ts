import { expect, test } from "vitest";
import { type Recent, upsertRecent } from "./config";

const at = (path: string): Recent => ({
	path,
	name: path,
	opened: new Date().toISOString(),
});

test("re-opening a project moves it to the top without duplicating", () => {
	const list = [at("/a"), at("/b"), at("/c")];
	const next = upsertRecent(list, at("/c"));

	expect(next.map((r) => r.path)).toEqual(["/c", "/a", "/b"]);
});

test("the list caps at 10, dropping the oldest", () => {
	let list: Recent[] = [];
	for (let i = 0; i < 12; i++) list = upsertRecent(list, at(`/p${i}`));

	expect(list).toHaveLength(10);
	expect(list[0].path).toBe("/p11");
	expect(list[list.length - 1].path).toBe("/p2");
});
