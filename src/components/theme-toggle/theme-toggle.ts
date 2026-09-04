import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import styles from "./theme-toggle.module.css";

export function createThemeToggle() {
	const LL = getLL();

	const wrapper = document.createElement("div");
	wrapper.className = styles.toggle;

	const button = document.createElement("button");
	button.className = styles.button;
	button.textContent = store.get("theme") === "dark" ? "\u2600" : "\u263E";
	button.setAttribute("aria-label", LL.toggleThemeLabel());

	wrapper.appendChild(button);
	document.body.appendChild(wrapper);

	function applyTheme(theme: "light" | "dark") {
		document.documentElement.classList.toggle("dark", theme === "dark");
		button.textContent = theme === "dark" ? "\u2600" : "\u263E";
	}

	button.addEventListener("click", () => {
		bus.emit("theme:toggle");
	});

	bus.on("theme:toggle", () => {
		const next = store.get("theme") === "light" ? "dark" : "light";
		store.set("theme", next);
	});

	store.on("theme", applyTheme, { immediate: true });
}
