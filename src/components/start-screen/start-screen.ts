import { open } from "@tauri-apps/plugin-dialog";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { addRecent, getRecents, removeRecent } from "../../services/config";
import { createProject, openProject } from "../../services/invoke";
import { createLanguageSelect } from "../../services/languages";
import styles from "./start-screen.module.css";

export function createStartScreen(container: HTMLElement) {
	const LL = getLL();

	// ── Main screen ──
	const screen = document.createElement("div");
	screen.className = styles.screen;

	const logo = document.createElement("div");
	logo.className = styles.logo;
	logo.textContent = LL.welcomeTitle();

	const subtitle = document.createElement("div");
	subtitle.className = styles.subtitle;
	subtitle.textContent = LL.welcomeSubtitle();

	const actions = document.createElement("div");
	actions.className = styles.actions;

	const btnCreate = document.createElement("button");
	btnCreate.className = "btn btn-primary";
	btnCreate.textContent = LL.createProject();

	const btnOpen = document.createElement("button");
	btnOpen.className = "btn";
	btnOpen.textContent = LL.openProject();

	actions.appendChild(btnCreate);
	actions.appendChild(btnOpen);
	screen.appendChild(logo);
	screen.appendChild(subtitle);
	screen.appendChild(actions);
	container.appendChild(screen);

	// ── Recent projects ──
	const recents = document.createElement("section");
	recents.className = styles.recents;
	screen.appendChild(recents);
	renderRecents();

	// ── Create project flow ──
	btnCreate.addEventListener("click", async () => {
		const selected = await open({ directory: true });
		if (!selected) return;

		showNameModal(selected as string);
	});

	// ── Open project flow ──
	btnOpen.addEventListener("click", async () => {
		const selected = await open({ directory: true });
		if (!selected) return;

		try {
			const meta = await openProject(selected as string, store.get("locale"));
			await onProjectReady(meta, selected as string);
		} catch (err) {
			showError(screen, String(err));
		}
	});

	// ── Name modal ──
	function showNameModal(folderPath: string) {
		const overlay = document.createElement("div");
		overlay.className = "modal";

		const card = document.createElement("div");
		card.className = "modal-card";

		const title = document.createElement("div");
		title.className = "modal-title";
		title.textContent = LL.createProject();

		const label = document.createElement("label");
		label.className = "modal-label";
		label.textContent = LL.projectNameLabel();

		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = LL.projectNamePlaceholder();
		input.autofocus = true;

		// The manuscript's language, which is not always the app's. Someone
		// reading menus in English can be writing a novel in Spanish.
		const langLabel = document.createElement("label");
		langLabel.className = "modal-label";
		langLabel.htmlFor = "new-project-language";
		langLabel.textContent = LL.projectLanguageLabel();

		const langSelect = createLanguageSelect(store.get("locale"));
		langSelect.id = "new-project-language";

		const modalActions = document.createElement("div");
		modalActions.className = "modal-actions";

		const btnCancel = document.createElement("button");
		btnCancel.className = "btn";
		btnCancel.textContent = LL.cancel();

		const btnConfirm = document.createElement("button");
		btnConfirm.className = "btn btn-primary";
		btnConfirm.textContent = LL.create();

		modalActions.appendChild(btnCancel);
		modalActions.appendChild(btnConfirm);
		card.appendChild(title);
		card.appendChild(label);
		card.appendChild(input);
		card.appendChild(langLabel);
		card.appendChild(langSelect);
		card.appendChild(modalActions);
		overlay.appendChild(card);
		document.body.appendChild(overlay);

		// Focus input after DOM paint
		requestAnimationFrame(() => input.focus());

		btnCancel.addEventListener("click", () => overlay.remove());
		overlay.addEventListener("click", (e) => {
			if (e.target === overlay) overlay.remove();
		});

		async function submit() {
			const name = input.value.trim();
			if (!name) return;

			try {
				const meta = await createProject(name, folderPath, langSelect.value);
				const projectPath = `${folderPath}/${name}`;
				overlay.remove();
				await onProjectReady(meta, projectPath);
			} catch (err) {
				// Show error inside modal
				let errEl = card.querySelector(".modal-error");
				if (!errEl) {
					errEl = document.createElement("div");
					errEl.className = "modal-error";
					card.appendChild(errEl);
				}
				errEl.textContent = String(err);
			}
		}

		btnConfirm.addEventListener("click", submit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") submit();
			if (e.key === "Escape") overlay.remove();
		});
	}

	async function renderRecents() {
		const list = await getRecents();
		recents.replaceChildren();
		if (list.length === 0) return;

		const title = document.createElement("div");
		title.className = styles.recentsTitle;
		title.textContent = LL.recentProjects();
		recents.appendChild(title);

		for (const item of list) {
			const row = document.createElement("div");
			row.className = styles.recentItem;

			const openBtn = document.createElement("button");
			openBtn.className = styles.recentOpen;
			openBtn.type = "button";

			const name = document.createElement("span");
			name.className = styles.recentName;
			name.textContent = item.name;

			const path = document.createElement("span");
			path.className = styles.recentPath;
			path.textContent = item.path;

			const removeBtn = document.createElement("button");
			removeBtn.className = styles.recentRemove;
			removeBtn.type = "button";
			removeBtn.textContent = "\u00d7";
			removeBtn.title = LL.removeFromRecents();
			removeBtn.setAttribute("aria-label", LL.removeFromRecents());

			openBtn.appendChild(name);
			openBtn.appendChild(path);
			row.appendChild(openBtn);
			row.appendChild(removeBtn);
			recents.appendChild(row);

			openBtn.addEventListener("click", async () => {
				try {
					const meta = await openProject(item.path, store.get("locale"));
					await onProjectReady(meta, item.path);
				} catch (err) {
					// The project moved or was deleted — drop it from the list.
					showError(screen, String(err));
					await removeRecent(item.path);
					await renderRecents();
				}
			});

			removeBtn.addEventListener("click", async () => {
				await removeRecent(item.path);
				await renderRecents();
			});
		}
	}

	async function onProjectReady(
		meta: Awaited<ReturnType<typeof openProject>>,
		path: string,
	) {
		await addRecent(path, meta.name);
		store.set("projectMeta", meta);
		store.set("projectPath", path);
		bus.emit("project:loaded", meta);
	}

	function showError(parent: HTMLElement, message: string) {
		let errEl = parent.querySelector(".modal-error");
		if (!errEl) {
			errEl = document.createElement("div");
			errEl.className = "modal-error";
			parent.appendChild(errEl);
		}
		errEl.textContent = message;

		// Auto-clear after 4s
		setTimeout(() => errEl?.remove(), 4000);
	}
}
