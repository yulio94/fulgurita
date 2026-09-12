import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { isMac } from "../../services/platform";
import styles from "./titlebar.module.css";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A stroked icon on the 24-unit grid `services/menu-icons.ts` already uses for
 * the native menus. SVG rather than a symbol character: U+25CE and U+263C fell
 * back to whatever each platform had for them and did not draw as icons.
 *
 * Stroke is currentColor, so .action and .actionOn keep carrying the state.
 */
function icon(...paths: string[]) {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("width", "16");
	svg.setAttribute("height", "16");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "1.75");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	// The button's aria-label is the name; the drawing must not be announced.
	svg.setAttribute("aria-hidden", "true");
	for (const d of paths) {
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", d);
		svg.appendChild(path);
	}
	return svg;
}

/** Concentric rings — the page with everything but the current line dimmed. */
const FOCUS = [
	"M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17",
	"M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 1 0 0-5.2",
];
const SUN = [
	"M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 1 0 0-8.8",
	"M12 2v2.4 M12 19.6V22 M2 12h2.4 M19.6 12H22",
	"M4.9 4.9l1.7 1.7 M17.4 17.4l1.7 1.7 M19.1 4.9l-1.7 1.7 M6.6 17.4l-1.7 1.7",
];
const MOON = ["M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3"];

/**
 * The 40px bar across the top of the window: focus mode and the theme switch.
 * It only emits — applying the theme is initTheme's job in main.ts, because the
 * start screen needs a theme before this bar exists.
 */
export function createTitlebar(container: HTMLElement) {
	const LL = getLL();

	const bar = document.createElement("div");
	bar.className = styles.titlebar;

	// macOS draws its traffic lights inside this bar (titleBarStyle: Overlay);
	// Windows and Linux keep their own titlebar above it and need no room.
	const lead = document.createElement("div");
	lead.className = isMac ? styles.leadMac : styles.lead;

	const actions = document.createElement("div");
	actions.className = styles.actions;

	const focusBtn = document.createElement("button");
	focusBtn.type = "button";
	focusBtn.appendChild(icon(...FOCUS));
	focusBtn.title = LL.cmdToggleFocusMode();
	focusBtn.setAttribute("aria-label", LL.focusModeLabel());
	focusBtn.addEventListener("click", () => bus.emit("focus:toggle"));

	const themeBtn = document.createElement("button");
	themeBtn.type = "button";
	themeBtn.className = styles.action;
	themeBtn.title = LL.toggleThemeLabel();
	themeBtn.addEventListener("click", () => bus.emit("theme:toggle"));

	// Overlay hands this strip to the webview, and with it the double-click the
	// system title bar used to answer. Tauri's drag region covers dragging but
	// not the zoom, so the bar has to do it itself.
	bar.addEventListener("dblclick", (event) => {
		if ((event.target as HTMLElement).closest("button")) return;
		void (async () => {
			try {
				const { getCurrentWindow } = await import("@tauri-apps/api/window");
				await getCurrentWindow().toggleMaximize();
			} catch {
				// Not running in Tauri (browser-only dev, tests) — no window to zoom
			}
		})();
	});

	actions.appendChild(focusBtn);
	actions.appendChild(themeBtn);
	bar.appendChild(lead);
	bar.appendChild(actions);
	container.appendChild(bar);

	store.on(
		"focusMode",
		(on) => {
			focusBtn.className = on ? styles.actionOn : styles.action;
			focusBtn.setAttribute("aria-pressed", String(on));
		},
		{ immediate: true },
	);

	// Sun and moon are the destination, not the state: the moon shows while the
	// light theme is on, because that is what clicking it gives you. aria-label
	// says the same thing in words, since the icon is all a sighted user gets.
	store.on(
		"resolvedTheme",
		(theme) => {
			const dark = theme === "dark";
			themeBtn.replaceChildren(icon(...(dark ? SUN : MOON)));
			themeBtn.setAttribute(
				"aria-label",
				dark ? LL.themeDay() : LL.themeNight(),
			);
		},
		{ immediate: true },
	);
}
