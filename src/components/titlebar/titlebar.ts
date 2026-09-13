import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { icon } from "../../services/icons";
import { isMac } from "../../services/platform";
import styles from "./titlebar.module.css";

/**
 * The bar across the top of the window: focus mode and the theme switch.
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
	focusBtn.appendChild(icon("focus"));
	focusBtn.title = LL.cmdToggleFocusMode();
	focusBtn.setAttribute("aria-label", LL.focusModeLabel());
	focusBtn.addEventListener("click", () => bus.emit("focus:toggle"));

	const themeBtn = document.createElement("button");
	themeBtn.type = "button";
	themeBtn.className = `btn-icon ${styles.action}`;
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
			// btn-icon is global (theme.css), so it is not hashed like the module classes.
			focusBtn.className = `btn-icon ${on ? styles.actionOn : styles.action}`;
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
			themeBtn.replaceChildren(icon(dark ? "sun" : "moon"));
			themeBtn.setAttribute(
				"aria-label",
				dark ? LL.themeDay() : LL.themeNight(),
			);
		},
		{ immediate: true },
	);
}
