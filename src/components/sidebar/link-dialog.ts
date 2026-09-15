import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { createResearchLink } from "../../services/invoke";
import {
	loadResearch,
	openResearch,
	toResearchDoc,
} from "../../services/research";
import styles from "./link-dialog.module.css";

/**
 * Saves a URL into `research/` with a title and notes (F-106). The card is the
 * create-project dialog's. A `<form>` so the browser checks the fields: submit
 * only fires once the title is there and the URL is http or https.
 */
export function openLinkDialog(): void {
	const LL = getLL();

	const overlay = document.createElement("div");
	overlay.className = "modal";

	const form = document.createElement("form");
	form.className = "modal-card";

	const heading = document.createElement("div");
	heading.className = "modal-title";
	heading.textContent = LL.newLink();

	const title = field(LL.linkTitle(), "link-title", "input");
	title.control.required = true;

	const url = field(LL.linkUrl(), "link-url", "input");
	url.control.type = "url";
	url.control.required = true;
	// type="url" accepts javascript: and file: too. The opener would refuse them
	// later; refusing here says so while the writer is still in the form.
	url.control.pattern = "https?://.+";
	url.control.placeholder = "https://";

	const notes = field(LL.linkNotes(), "link-notes", "textarea");
	notes.control.className = styles.notes;
	notes.control.rows = 4;

	const error = document.createElement("div");
	error.className = "modal-error";
	error.hidden = true;

	const actions = document.createElement("div");
	actions.className = "modal-actions";
	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = "btn";
	cancel.textContent = LL.cancel();
	const save = document.createElement("button");
	save.type = "submit";
	save.className = "btn btn-primary";
	save.textContent = LL.save();
	actions.append(cancel, save);

	form.append(
		heading,
		title.label,
		title.control,
		url.label,
		url.control,
		notes.label,
		notes.control,
		actions,
		error,
	);
	overlay.appendChild(form);
	document.body.appendChild(overlay);
	requestAnimationFrame(() => title.control.focus());

	const close = () => overlay.remove();
	cancel.addEventListener("click", close);
	overlay.addEventListener("click", (event) => {
		if (event.target === overlay) close();
	});
	overlay.addEventListener("keydown", (event) => {
		if (event.key === "Escape") close();
	});

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const projectPath = store.get("projectPath");
		if (!projectPath) return;
		save.disabled = true;
		try {
			const item = await createResearchLink(
				projectPath,
				title.control.value,
				url.control.value,
				notes.control.value,
			);
			close();
			await loadResearch();
			await openResearch(toResearchDoc(item));
		} catch (err) {
			// Kept open with what was typed, so a refused write can be retried
			error.textContent = String(err);
			error.hidden = false;
			save.disabled = false;
		}
	});
}

function field<K extends "input" | "textarea">(
	text: string,
	id: string,
	tag: K,
): { label: HTMLLabelElement; control: HTMLElementTagNameMap[K] } {
	const label = document.createElement("label");
	label.className = "modal-label";
	label.htmlFor = id;
	label.textContent = text;
	const control = document.createElement(tag);
	control.id = id;
	return { label, control };
}
