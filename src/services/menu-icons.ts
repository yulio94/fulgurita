import { Image } from "@tauri-apps/api/image";
import { NativeIcon } from "@tauri-apps/api/menu";
import { isMac } from "./platform";
import type { MenuIconName, ViewMenuItem } from "./providers";

/**
 * What each icon name draws.
 *
 * `path` is an SVG path on a 24-unit grid, stroked. `native` is what macOS gets
 * instead: a real template image, which AppKit tints for light, for dark and for
 * the highlighted row on its own. It is macOS-only — muda takes `NativeIcon` as
 * `_native_icon` on Windows and GTK and stores nothing — so `path` is what the
 * other two draw, and what macOS falls back to.
 *
 * `rename` has no `native` because AppKit ships nothing that means rename.
 * `Advanced` is a colour gear and `FontPanel` a colour panel; neither is a
 * template, so neither would tint.
 */
const ICONS: Record<MenuIconName, { path: string; native?: NativeIcon }> = {
	rename: { path: "M4 20l1-4L16 5l3 3L8 19z M14 7l3 3" },
	delete: {
		path: "M3 6h18 M9 6V4h6v2 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
		native: NativeIcon.Remove,
	},
	restore: {
		// Counter-clockwise, with the gap and the head in the upper-left quadrant
		path: "M4 12a8 8 0 1 0 8-8 M15.5 1.5l-3.5 2.5 3.5 2.5",
		native: NativeIcon.RefreshFreestanding,
	},
};

/** The icon names, for a test that asks whether a provider named a real one. */
export const iconNames = Object.keys(ICONS) as MenuIconName[];

/**
 * macOS draws the image at 18pt (`to_nsimage(Some(18.))`). GTK hard-scales to
 * 16px whatever we send, and Windows draws the bitmap at its native size and
 * grows the row to fit, so 16 is the number there too. Times the display, which
 * is read per call because the window can be dragged to another one.
 */
const size = () => Math.round((isMac ? 18 : 16) * devicePixelRatio);

/** Strokes one path into RGBA, or null when there is no canvas to stroke it on. */
function rasterize(path: string, px: number): Uint8Array | null {
	const canvas = document.createElement("canvas");
	canvas.width = px;
	canvas.height = px;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;

	ctx.scale(px / 24, px / 24);
	ctx.lineWidth = 2;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	// The system draws this menu with the system appearance, and the app's own
	// theme toggle does not govern it — so the colour is the OS preference, not
	// the store, and these are menu-text neutrals rather than our sand.
	ctx.strokeStyle = matchMedia("(prefers-color-scheme: dark)").matches
		? "#e6e6e6"
		: "#1a1a1a";
	ctx.stroke(new Path2D(path));

	return new Uint8Array(ctx.getImageData(0, 0, px, px).data);
}

/**
 * The rows of a context menu as the OS menu items that draw them.
 *
 * Rasterized per call rather than cached: a menu opens rarely, a few strokes
 * cost nothing, and it means a change of the system appearance mid-session is
 * picked up without listening for one.
 */
export async function toMenuItems(items: ViewMenuItem[]) {
	const { IconMenuItem, MenuItem } = await import("@tauri-apps/api/menu");
	const px = size();

	return Promise.all(
		items.map(async ({ icon, ...opts }) => {
			const spec = ICONS[icon];
			if (isMac && spec.native) {
				return IconMenuItem.new({ ...opts, icon: spec.native });
			}

			const rgba = rasterize(spec.path, px);
			// No 2D context — a lost one in a browser, and the path the tests take
			// unless they stub it. The row goes without rather than not at all.
			if (!rgba) return MenuItem.new(opts);

			const image = await Image.new(rgba, px, px);
			const item = await IconMenuItem.new({ ...opts, icon: image });
			// muda converted it to an NSImage/pixbuf/HBITMAP building that item, so
			// the resource is free to go. Without this we leak one per icon, per
			// popup, for as long as the app runs.
			void image.close();
			return item;
		}),
	);
}
