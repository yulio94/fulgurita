import Split from "split-grid";
import { bus } from "../core/bus";
import { store } from "../core/store";
import { persistPanelWidths } from "./config";

/* ── Track indices in the 5-column grid ──────────────────
   grid-template-columns: [sidebar] [div] [editor] [div] [inspector]
   Track:                    0        1      2       3       4
   ───────────────────────────────────────────────────────── */

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 360;
const INSPECTOR_MIN = 240;
const INSPECTOR_MAX = 400;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function initSplitPanels(
	app: HTMLElement,
	initialSidebarWidth: number,
	initialInspectorWidth: number,
) {
	const dividers = app.querySelectorAll<HTMLElement>(".divider");
	if (dividers.length < 2) return;

	const [sidebarGutter, inspectorGutter] = dividers;

	// Remembered sizes — restored when a panel is toggled back open
	let sidebarWidth = initialSidebarWidth;
	let inspectorWidth = initialInspectorWidth;

	let instance: ReturnType<typeof Split> | null = null;

	function mountSplit() {
		instance?.destroy();

		const focus = store.get("focusMode");
		const sidebarOpen = store.get("sidebarOpen") && !focus;
		const inspectorOpen = store.get("inspectorOpen") && !focus;

		// Only register gutters for visible panels
		const gutters: { track: number; element: HTMLElement }[] = [];
		if (sidebarOpen) gutters.push({ track: 1, element: sidebarGutter });
		if (inspectorOpen) gutters.push({ track: 3, element: inspectorGutter });

		if (gutters.length === 0) {
			instance = null;
			return;
		}

		const minSizes: Record<number, number> = {};
		if (sidebarOpen) minSizes[0] = SIDEBAR_MIN;
		if (inspectorOpen) minSizes[4] = INSPECTOR_MIN;

		instance = Split({
			columnGutters: gutters,
			columnMinSizes: minSizes,
			snapOffset: 0,
			writeStyle: (grid, prop, style) => {
				// Clamp panel sizes to enforce max widths
				const cols = style.split(/\s+/);
				if (sidebarOpen && cols[0]) {
					const w = parseFloat(cols[0]);
					cols[0] = `${clamp(w, SIDEBAR_MIN, SIDEBAR_MAX)}px`;
				}
				if (inspectorOpen && cols[4]) {
					const w = parseFloat(cols[4]);
					cols[4] = `${clamp(w, INSPECTOR_MIN, INSPECTOR_MAX)}px`;
				}
				grid.style.setProperty(prop, cols.join(" "));
			},
			onDragStart: () => {
				app.classList.add("is-resizing");
				document.body.style.cursor = "col-resize";
				document.body.style.userSelect = "none";
			},
			onDrag: (_direction, track, style) => {
				// Track sizes from the grid-template-columns string
				const cols = style.split(/\s+/);
				if (track === 1) {
					sidebarWidth = clamp(
						parseFloat(cols[0]) || sidebarWidth,
						SIDEBAR_MIN,
						SIDEBAR_MAX,
					);
				}
				if (track === 3) {
					inspectorWidth = clamp(
						parseFloat(cols[4]) || inspectorWidth,
						INSPECTOR_MIN,
						INSPECTOR_MAX,
					);
				}
			},
			onDragEnd: () => {
				app.classList.remove("is-resizing");
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
				persistPanelWidths(sidebarWidth, inspectorWidth);
			},
		});
	}

	function applyLayout() {
		// focusMode overrides both panels without touching sidebarOpen /
		// inspectorOpen, so whatever the user had open comes back on exit.
		const focus = store.get("focusMode");
		const sidebar = store.get("sidebarOpen") && !focus;
		const inspector = store.get("inspectorOpen") && !focus;

		// Set grid columns inline — includes remembered sizes for open panels
		const cols = [
			sidebar ? `${sidebarWidth}px` : "0px",
			sidebar ? "1px" : "0px",
			"1fr",
			inspector ? "1px" : "0px",
			inspector ? `${inspectorWidth}px` : "0px",
		];
		app.style.gridTemplateColumns = cols.join(" ");

		// CSS classes for any component that needs to know panel state
		app.classList.remove("sidebar-closed", "inspector-closed", "both-closed");
		if (!sidebar && !inspector) {
			app.classList.add("both-closed");
		} else if (!sidebar) {
			app.classList.add("sidebar-closed");
		} else if (!inspector) {
			app.classList.add("inspector-closed");
		}

		mountSplit();
	}

	bus.on("panel:toggle-sidebar", () => {
		store.set("sidebarOpen", !store.get("sidebarOpen"));
		applyLayout();
	});

	store.on("focusMode", () => {
		applyLayout();
	});

	bus.on("panel:toggle-inspector", () => {
		store.set("inspectorOpen", !store.get("inspectorOpen"));
		applyLayout();
	});

	// Not just mountSplit: loadConfig fills the store before the panels mount, so
	// the persisted open state and widths are already here and have to be applied.
	// applyLayout mounts the split itself.
	applyLayout();
}
