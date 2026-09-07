import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { setProjectLanguage } from "../../services/invoke";
import { createLanguageSelect } from "../../services/languages";
import styles from "./settings.module.css";

let overlay: HTMLElement | null = null;

/** Wires the modal to the bus. Project-scoped, so it mounts with the editor. */
export function createSettings() {
	bus.on("settings:open", open);
}

function open() {
	if (overlay) return;
	const LL = getLL();

	overlay = document.createElement("div");
	overlay.className = styles.modal;

	const card = document.createElement("div");
	card.className = styles.modalCard;

	const title = document.createElement("div");
	title.className = styles.modalTitle;
	title.textContent = LL.settingsTitle();

	const label = document.createElement("label");
	label.className = styles.label;
	label.htmlFor = "settings-language";
	label.textContent = LL.projectLanguageLabel();

	// The project's own language wins over the app's. They differ exactly when
	// someone writes in one language and reads menus in another, which is the
	// case this control exists for.
	const current = store.get("projectMeta")?.language ?? store.get("locale");
	const select = createLanguageSelect(current);
	select.id = "settings-language";
	select.className = styles.select;

	const hint = document.createElement("div");
	hint.className = styles.hint;
	hint.textContent = LL.projectLanguageHint();

	const actions = document.createElement("div");
	actions.className = styles.modalActions;

	const btnDone = document.createElement("button");
	btnDone.className = styles.btnPrimary;
	btnDone.textContent = LL.done();
	actions.appendChild(btnDone);

	card.appendChild(title);
	card.appendChild(label);
	card.appendChild(select);
	card.appendChild(hint);
	card.appendChild(actions);
	overlay.appendChild(card);
	document.body.appendChild(overlay);

	requestAnimationFrame(() => select.focus());

	btnDone.addEventListener("click", close);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) close();
	});
	select.addEventListener("keydown", (e) => {
		if (e.key === "Escape") close();
	});

	// On change, not on a Save button. There is one field and it is reversible.
	select.addEventListener("change", async () => {
		const path = store.get("projectPath");
		const meta = store.get("projectMeta");
		if (!path || !meta) return;

		try {
			const language = await setProjectLanguage(path, select.value);
			// Patch the store, never re-read it. The tree here is the one
			// open_project pruned in memory, and sidebar.ts rebuilds itself on
			// every projectMeta set — a fresh load would put the orphans back.
			store.set("projectMeta", { ...meta, language });
		} catch (err) {
			select.value = meta.language;
			showError(card, String(err));
		}
	});
}

function close() {
	overlay?.remove();
	overlay = null;
}

function showError(card: HTMLElement, message: string) {
	let el = card.querySelector<HTMLElement>(`.${styles.error}`);
	if (!el) {
		el = document.createElement("div");
		el.className = styles.error;
		card.appendChild(el);
	}
	el.textContent = message;
}
