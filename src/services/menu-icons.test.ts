import { beforeEach, expect, test, vi } from "vitest";
import { store } from "../core/store";

// The real modules reach for a Tauri window. Only what toMenuItems calls.
vi.mock("@tauri-apps/api/image", () => ({
	Image: { new: vi.fn(async () => ({ close: vi.fn() })) },
}));
vi.mock("@tauri-apps/api/menu", () => ({
	NativeIcon: { Remove: "Remove", RefreshFreestanding: "RefreshFreestanding" },
	IconMenuItem: { new: vi.fn(async (opts) => opts) },
	MenuItem: { new: vi.fn(async (opts) => opts) },
}));

const { toMenuItems } = await import("./menu-icons");

/** The colour the last rasterize reached for, or null if it never stroked. */
let stroked: string | null = null;

// happy-dom ships no canvas, so neither the path nor the context is real here.
vi.stubGlobal("Path2D", class {});

beforeEach(() => {
	stroked = null;
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		scale: vi.fn(),
		stroke: vi.fn(),
		getImageData: () => ({ data: new Uint8ClampedArray(4) }),
		set strokeStyle(value: string) {
			stroked = value;
		},
		lineWidth: 0,
		lineCap: "",
		lineJoin: "",
	} as unknown as CanvasRenderingContext2D);
});

// rename is the one row with no AppKit template, so it is the one that still
// rasterizes on macOS — and the only place the theme picks the colour there.
// delete and restore rasterize the same way on Windows and Linux.
test("strokes menu icons against the app's theme, not the system's", async () => {
	store.set("resolvedTheme", "dark");
	await toMenuItems([
		{ id: "rename", icon: "rename", text: "Rename", action: () => {} },
	]);
	expect(stroked).toBe("#e6e6e6");

	store.set("resolvedTheme", "light");
	await toMenuItems([
		{ id: "rename", icon: "rename", text: "Rename", action: () => {} },
	]);
	expect(stroked).toBe("#1a1a1a");
});
