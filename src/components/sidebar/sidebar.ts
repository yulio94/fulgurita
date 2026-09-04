import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { openChapter } from "../../services/chapters";
import type { Doc } from "../../types";
import styles from "./sidebar.module.css";

export function createSidebar(container: HTMLElement) {
	const LL = getLL();

	// Render
	container.innerHTML = `
    <div class="${styles.sidebar}">
      <div class="${styles.header}">
        <h2 class="${styles.headerTitle}">${LL.library()}</h2>
        <button class="${styles.btnNew}" id="btn-new">${LL.newDocument()}</button>
      </div>
      <div class="${styles.projectTitle}" id="project-title"></div>
      <div class="${styles.docList}" id="doc-list"></div>
    </div>
  `;

	// Set user-controlled project name safely (textContent, not innerHTML)
	const initTitle = container.querySelector("#project-title");
	if (initTitle) {
		initTitle.textContent = store.get("projectMeta")?.name ?? LL.projectTitle();
	}

	// New document button
	container.querySelector("#btn-new")?.addEventListener("click", () => {
		bus.emit("document:new");
	});

	// Reactive render on documents change
	store.on("documents", (docs: Doc[]) => renderDocs(docs));
	store.on("activeDoc", () => renderDocs(store.get("documents") ?? []));

	// Reactively update project title
	store.on("projectMeta", (meta) => {
		const titleEl = container.querySelector("#project-title");
		if (titleEl) {
			titleEl.textContent = meta?.name ?? LL.projectTitle();
		}
	});

	function renderDocs(docs: Doc[]) {
		const list = container.querySelector("#doc-list");
		if (!list) return;
		const activeId = store.get("activeDoc")?.id;

		// Build items via DOM API so user content can't inject markup
		list.replaceChildren(
			...docs.map((doc) => {
				const item = document.createElement("div");
				item.className =
					doc.id === activeId ? styles.docItemActive : styles.docItem;

				const title = document.createElement("div");
				title.className = styles.docTitle;
				title.textContent = doc.title;

				const preview = document.createElement("div");
				preview.className = styles.docPreview;
				preview.textContent = doc.preview;

				const meta = document.createElement("div");
				meta.className = styles.docMeta;
				meta.textContent = doc.meta;

				item.append(title, preview, meta);
				item.addEventListener("click", () => {
					// Flush the chapter being left before reading the next one
					bus.emit("document:save");
					void openChapter(doc);
				});
				return item;
			}),
		);
	}
}
