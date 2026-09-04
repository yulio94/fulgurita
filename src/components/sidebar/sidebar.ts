import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { commitRename, openChapter } from "../../services/chapters";
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

	// Which row is being renamed. Held here rather than by swapping the DOM node:
	// the first click of a double-click already starts openChapter, whose await
	// re-renders the list a moment later and would destroy a swapped-in input.
	let renamingId: string | null = null;

	function rerender() {
		renderDocs(store.get("documents") ?? []);
	}

	// ponytail: the input is rebuilt on every render, so a render mid-edit resets
	// the caret. Only openChapter re-renders during a rename, and that lands before
	// anyone has typed. Cache the node here if that stops being true.
	function renameInput(doc: Doc): HTMLInputElement {
		const input = document.createElement("input");
		input.className = styles.docTitleEdit;
		input.value = doc.title;
		input.setAttribute("aria-label", LL.chapterTitleLabel());

		// `change` covers Enter and blur-after-edit; blur alone restores the row
		input.addEventListener("change", () => {
			void commitRename(doc, input.value).then((result) => {
				// Enter leaves the field focused, so a rejected name stays open to be
				// fixed. On a click-away the blur handler has already closed the row.
				if (result === "duplicate" && document.activeElement === input) {
					input.select();
					return;
				}
				renamingId = null;
				rerender();
			});
		});
		input.addEventListener("blur", () => {
			renamingId = null;
			rerender();
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				renamingId = null;
				rerender();
			}
		});
		// Clicking the field must not re-open the row underneath it
		input.addEventListener("click", (e) => e.stopPropagation());
		return input;
	}

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

				const editing = doc.id === renamingId;
				let title: HTMLElement;
				if (editing) {
					title = renameInput(doc);
				} else {
					title = document.createElement("div");
					title.className = styles.docTitle;
					title.textContent = doc.title;
					title.addEventListener("dblclick", () => {
						renamingId = doc.id;
						rerender();
					});
				}

				const preview = document.createElement("div");
				preview.className = styles.docPreview;
				preview.textContent = doc.preview;

				const meta = document.createElement("div");
				meta.className = styles.docMeta;
				meta.textContent = doc.meta;

				item.append(title, preview, meta);
				item.addEventListener("click", () => {
					if (renamingId === doc.id) return;
					// Flush the chapter being left before reading the next one
					bus.emit("document:save");
					void openChapter(doc);
				});
				if (editing) {
					// Focus after the node is in the document, or focus() is a no-op
					queueMicrotask(() => {
						(title as HTMLInputElement).focus();
						(title as HTMLInputElement).select();
					});
				}
				return item;
			}),
		);
	}
}
