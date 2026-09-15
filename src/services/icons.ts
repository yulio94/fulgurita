const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Every pictogram in the app, as one stroked SVG path on a 24-unit grid.
 *
 * SVG rather than a symbol character: U+25CE, U+263C and ▸ all fell back to
 * whatever each platform had for them and did not draw as icons. Typographic
 * buttons (bold, italic, the quote mark) stay text, because they are the
 * typeface's own letterforms.
 *
 * services/menu-icons.ts rasterizes the same paths for the native menus.
 */
export const ICON_PATHS = {
	/** Concentric rings — the page with everything but the current line dimmed. */
	focus:
		"M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17 M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 1 0 0-5.2",
	sun: "M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 1 0 0-8.8 M12 2v2.4 M12 19.6V22 M2 12h2.4 M19.6 12H22 M4.9 4.9l1.7 1.7 M17.4 17.4l1.7 1.7 M19.1 4.9l-1.7 1.7 M6.6 17.4l-1.7 1.7",
	moon: "M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3",
	plus: "M12 5v14 M5 12h14",
	folderPlus:
		"M3.5 18.5v-12a1 1 0 0 1 1-1h4.2l1.8 2.2h8a1 1 0 0 1 1 1v9.8a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1z M12 11.5v5 M9.5 14h5",
	folder:
		"M3.5 18.5v-12a1 1 0 0 1 1-1h4.2l1.8 2.2h8a1 1 0 0 1 1 1v9.8a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1z",
	globe:
		"M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M3 12h18 M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9 M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9",
	close: "M6 6l12 12 M18 6L6 18",
	check: "M5 12.5l4.5 4.5L19 7.5",
	chevronDown: "M6 9.5l6 6 6-6",
	chevronRight: "M9.5 5.5l6 6.5-6 6.5",
	// The dots are zero-length segments, drawn round by stroke-linecap
	list: "M8.5 7h11 M8.5 12h11 M8.5 17h11 M4.5 7h.01 M4.5 12h.01 M4.5 17h.01",
	rename: "M4 20l1-4L16 5l3 3L8 19z M14 7l3 3",
	delete: "M3 6h18 M9 6V4h6v2 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
	// Counter-clockwise, with the gap and the head in the upper-left quadrant
	restore: "M4 12a8 8 0 1 0 8-8 M15.5 1.5l-3.5 2.5 3.5 2.5",
	/** A box with an arrow leaving it: hand the file to another app. */
	open: "M14 4h6v6 M10 14L20 4 M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5",
	/** Two chain links. */
	link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2",
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** The one stroke weight, for the DOM and the native-menu raster alike. */
export const ICON_STROKE = 1.75;

/**
 * One icon as an `<svg>`. It carries no width or height: the global `.icon`
 * rule in theme.css sizes it, and `.icon-sm` when `small` is set, so the glyph
 * and the box it sits in are both decided in CSS. Stroke is currentColor, so
 * the button carries the state.
 */
export function icon(name: IconName, small = false): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", small ? "icon icon-sm" : "icon");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", String(ICON_STROKE));
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	// The button's aria-label is the name; the drawing must not be announced.
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", ICON_PATHS[name]);
	svg.appendChild(path);
	return svg;
}
