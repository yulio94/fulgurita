import { expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: vi.fn() }));

const { cssPoint, dropFolder } = await import("./research-drop");

function row(id: string, type: "folder" | "item") {
	const el = document.createElement("div");
	el.dataset.id = id;
	el.dataset.type = type;
	const title = document.createElement("span");
	el.appendChild(title);
	return title;
}

test("a drop lands in the folder under the pointer, or in the one around the file", () => {
	expect(dropFolder(row("research/Places", "folder"))).toBe("research/Places");
	expect(dropFolder(row("research/Places/Harbour/map.png", "item"))).toBe(
		"research/Places/Harbour",
	);
});

test("a file at the top, empty space and the manuscript all mean research/ itself", () => {
	expect(dropFolder(row("research/scan.pdf", "item"))).toBeNull();
	expect(dropFolder(document.createElement("div"))).toBeNull();
	expect(dropFolder(row("f1", "folder"))).toBeNull();
});

// Found on macOS: the drop landed in the folder above the one under the pointer,
// because a point already in CSS pixels was halved on a 2x display.
test("only Windows reports the drop in physical pixels", () => {
	const point = { x: 400, y: 300 };
	expect(cssPoint(point, false, 2)).toEqual({ x: 400, y: 300 });
	expect(cssPoint(point, true, 2)).toEqual({ x: 200, y: 150 });
});
