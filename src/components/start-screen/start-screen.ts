import { open } from "@tauri-apps/plugin-dialog";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { addRecent, getRecents, removeRecent } from "../../services/config";
import { createProject, openProject } from "../../services/invoke";
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
	btnCreate.className = styles.btnPrimary;
	btnCreate.textContent = LL.createProject();

	const btnOpen = document.createElement("button");
	btnOpen.className = styles.btn;
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
			const meta = await openProject(selected as string);
			await onProjectReady(meta, selected as string);
		} catch (err) {
			showError(screen, String(err));
		}
	});

	// ── Name modal ──
	function showNameModal(folderPath: string) {
		const overlay = document.createElement("div");
		overlay.className = styles.modal;

		const card = document.createElement("div");
		card.className = styles.modalCard;

		const title = document.createElement("div");
		title.className = styles.modalTitle;
		title.textContent = LL.createProject();

		const label = document.createElement("label");
		label.className = styles.label;
		label.textContent = LL.projectNameLabel();

		const input = document.createElement("input");
		input.className = styles.input;
		input.type = "text";
		input.placeholder = LL.projectNamePlaceholder();
		input.autofocus = true;

		const modalActions = document.createElement("div");
		modalActions.className = styles.modalActions;

		const btnCancel = document.createElement("button");
		btnCancel.className = styles.btn;
		btnCancel.textContent = LL.cancel();

		const btnConfirm = document.createElement("button");
		btnConfirm.className = styles.btnPrimary;
		btnConfirm.textContent = LL.create();

		modalActions.appendChild(btnCancel);
		modalActions.appendChild(btnConfirm);
		card.appendChild(title);
		card.appendChild(label);
		card.appendChild(input);
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
				const meta = await createProject(name, folderPath, store.get("locale"));
				const projectPath = `${folderPath}/${name}`;
				overlay.remove();
				await onProjectReady(meta, projectPath);
			} catch (err) {
				// Show error inside modal
				let errEl = card.querySelector(`.${styles.error}`);
				if (!errEl) {
					errEl = document.createElement("div");
					errEl.className = styles.error;
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
					const meta = await openProject(item.path);
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
		let errEl = parent.querySelector(`.${styles.error}`);
		if (!errEl) {
			errEl = document.createElement("div");
			errEl.className = styles.error;
			parent.appendChild(errEl);
		}
		errEl.textContent = message;

		// Auto-clear after 4s
		setTimeout(() => errEl?.remove(), 4000);
	}
}
