import { Editor } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { commitRename, htmlToMarkdown, toDoc } from "../../services/chapters";
import { saveChapter } from "../../services/invoke";
import type { Doc, EditorStats, OutlineItem } from "../../types";
import styles from "./editor.module.css";
import { createFormatToolbar } from "./format-toolbar";

const SAVE_DEBOUNCE_MS = 2000;

function computeStats(editor: Editor): EditorStats {
	const LL = getLL();
	const text = editor.getText();
	const words = text.split(/\s+/).filter((w) => w.length > 0).length;
	const characters = editor.storage.characterCount?.characters() ?? 0;
	const paragraphs = editor.getJSON().content?.length ?? 0;
	const minutes = Math.max(1, Math.ceil(words / 238));
	return {
		words,
		characters,
		paragraphs,
		readingTime: LL.readingTime({ minutes }),
	};
}

function computeOutline(editor: Editor): OutlineItem[] {
	const items: OutlineItem[] = [];
	const json = editor.getJSON();
	if (!json.content) return items;

	for (const node of json.content) {
		if (node.type === "heading" && node.attrs?.level) {
			const text =
				node.content
					?.map((c) => ("text" in c ? (c.text as string) : ""))
					.join("") ?? "";
			if (text.trim()) {
				items.push({
					id: `heading-${items.length}`,
					text,
					level: node.attrs.level as number,
				});
			}
		}
	}
	return items;
}

export function createEditor(container: HTMLElement) {
	const LL = getLL();

	// Build DOM safely — no user content in the template
	const area = document.createElement("div");
	area.className = styles.editorArea;

	const toolbar = document.createElement("div");
	toolbar.className = styles.toolbar;
	// An input rather than a span: renaming the open chapter is just typing here.
	const toolbarTitle = document.createElement("input");
	toolbarTitle.className = styles.toolbarTitle;
	toolbarTitle.setAttribute("aria-label", LL.chapterTitleLabel());
	toolbar.appendChild(toolbarTitle);

	const scroll = document.createElement("div");
	scroll.className = styles.scroll;
	const editorContent = document.createElement("div");
	editorContent.className = styles.content;
	scroll.appendChild(editorContent);

	area.appendChild(toolbar);
	container.appendChild(area);

	const editor = new Editor({
		element: editorContent,
		extensions: [
			StarterKit,
			CharacterCount,
			Placeholder.configure({ placeholder: LL.placeholder() }),
			Typography,
		],
		content: "",
		onUpdate: ({ editor: ed }) => {
			store.set("stats", computeStats(ed));
			store.set("outline", computeOutline(ed));
			markDirty();
		},
		onFocus: () => {
			if (store.get("focusMode")) {
				editorContent.setAttribute("data-focused", "true");
			}
		},
		onBlur: () => {
			editorContent.removeAttribute("data-focused");
		},
	});

	// After the Editor: the format row needs it, and it sits above the text.
	createFormatToolbar(area, editor);
	area.appendChild(scroll);

	// The editor holds the content, so the editor owns the save.
	let dirty = false;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function markDirty() {
		dirty = true;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(persist, SAVE_DEBOUNCE_MS);
	}

	// getHTML() runs before the first await, so a save-then-switch cannot race:
	// the sidebar can trigger this and immediately load the next chapter.
	async function persist() {
		clearTimeout(saveTimer);
		const doc = store.get("activeDoc");
		const projectPath = store.get("projectPath");
		if (!dirty || !doc || !projectPath) return;

		const markdown = htmlToMarkdown(editor.getHTML());
		dirty = false;

		const saved = await saveChapter(projectPath, doc.id, markdown);
		// Refresh the sidebar's word count and timestamp. Spread the old doc
		// first — notes live in memory only until F-023.
		store.set(
			"documents",
			store
				.get("documents")
				.map((d) =>
					d.id === saved.id
						? { ...toDoc(saved, d.content), notes: d.notes }
						: d,
				),
		);
	}

	// `change` fires on Enter and on blur-after-edit, so one listener covers both
	// ways of committing a rename.
	toolbarTitle.addEventListener("change", () => {
		const doc = store.get("activeDoc");
		if (!doc) return;
		const title = toolbarTitle.value.trim();
		// Flush the body first so a pending autosave cannot interleave with the rename
		void persist()
			.then(() => commitRename(doc, title))
			.then((result) => {
				// Enter leaves the field focused, so a rejected name stays open to be
				// fixed. A click-away does not, and stealing focus back would fight it.
				if (result === "duplicate" && document.activeElement === toolbarTitle) {
					toolbarTitle.select();
					return;
				}
				toolbarTitle.value = store.get("activeDoc")?.title ?? doc.title;
			});
	});

	bus.on("document:save", () => {
		void persist();
	});

	// Load document content
	bus.on("document:load", (doc: Doc) => {
		editor.commands.setContent(doc.content || "");
		// setContent fires onUpdate, so the flag clears after it, not before
		clearTimeout(saveTimer);
		dirty = false;
		toolbarTitle.value = doc.title;
		store.set("stats", computeStats(editor));
		store.set("outline", computeOutline(editor));
	});

	// Scroll to heading from outline click
	bus.on("editor:scroll-to", (item: OutlineItem) => {
		const headings = editorContent.querySelectorAll("h1, h2, h3");
		const idx = store.get("outline").findIndex((o) => o.id === item.id);
		if (idx >= 0 && headings[idx]) {
			headings[idx].scrollIntoView({ behavior: "smooth", block: "center" });
		}
	});

	// Focus mode toggle
	bus.on("focus:toggle", () => {
		const focused = !store.get("focusMode");
		store.set("focusMode", focused);
		if (focused) {
			editorContent.setAttribute("data-focused", "true");
		} else {
			editorContent.removeAttribute("data-focused");
		}
	});

	store.on("focusMode", (focused) => {
		if (focused && editor.isFocused) {
			editorContent.setAttribute("data-focused", "true");
		} else if (!focused) {
			editorContent.removeAttribute("data-focused");
		}
	});
}
