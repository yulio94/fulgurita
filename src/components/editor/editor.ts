import { openUrl } from "@tauri-apps/plugin-opener";
import { Editor } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import StarterKit from "@tiptap/starter-kit";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import {
	commitRename,
	htmlToMarkdown,
	markdownToHtml,
	openChapter,
	refreshDocuments,
	toDoc,
} from "../../services/chapters";
import { readChapter, saveChapter } from "../../services/invoke";
import { isMac } from "../../services/platform";
import {
	isResearch,
	openResearchById,
	researchIdFromHref,
} from "../../services/research";
import { itemIds } from "../../services/tree";
import type { Doc, EditorStats, OutlineItem } from "../../types";
import styles from "./editor.module.css";
import { createFormatToolbar } from "./format-toolbar";
import { ParagraphStyle } from "./paragraph-style";
import { attachResearchPreview } from "./research-preview";
import { createStyleDropdown } from "./style-dropdown";

const SAVE_DEBOUNCE_MS = 2000;

// Same rule as word_count() in chapter.rs: a token is a word when it holds a
// letter or digit, so a lone "—" or "…" is not one. Keep the two in step.
export function countWords(text: string): number {
	return text.split(/\s+/).filter((t) => /[\p{Alphabetic}\p{N}]/u.test(t))
		.length;
}

function computeStats(editor: Editor): EditorStats {
	const LL = getLL();
	const words = countWords(editor.getText());
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

	const scroll = document.createElement("div");
	scroll.className = styles.scroll;

	// The format bar scrolls with the text but stays pinned to the top of the
	// column, so it needs its own dock above the page.
	const formatDock = document.createElement("div");
	formatDock.className = styles.formatDock;

	// The measure. Title and body share it, which is what makes the heading read
	// as part of the document rather than as chrome above it.
	const page = document.createElement("div");
	page.className = styles.page;

	// Where the chapter sits in the manuscript. Read-only, and hidden for a
	// chapter that is not in the tree at all.
	const eyebrow = document.createElement("div");
	eyebrow.className = styles.eyebrow;

	// The way back to the chapter a research link was followed out of
	const backButton = document.createElement("button");
	backButton.type = "button";
	backButton.className = `btn ${styles.back}`;
	backButton.hidden = true;

	// A textarea rather than an input: at this size a chapter name runs past the
	// measure, and an input can only scroll it out of sight. Kept to one visual
	// line by rows=1 and grown to fit — Enter commits rather than breaking.
	const toolbarTitle = document.createElement("textarea");
	toolbarTitle.className = styles.toolbarTitle;
	toolbarTitle.rows = 1;
	toolbarTitle.setAttribute("aria-label", LL.chapterTitleLabel());

	const editorContent = document.createElement("div");
	editorContent.className = styles.content;

	page.appendChild(backButton);
	page.appendChild(eyebrow);
	page.appendChild(toolbarTitle);
	page.appendChild(editorContent);
	scroll.appendChild(formatDock);
	scroll.appendChild(page);

	// Shown when the open document changes on disk while there are unsaved edits
	// in it. Under the scroller, at the foot of the column, because that is where
	// the writer is looking: they are typing, and new text goes at the bottom.
	const conflictBar = document.createElement("div");
	conflictBar.className = styles.conflict;
	conflictBar.setAttribute("role", "alert");
	conflictBar.hidden = true;
	const conflictText = document.createElement("span");
	conflictText.textContent = LL.changedOnDisk();
	// Neither is .btn-primary: each one throws away a version, so neither is the
	// safe default
	const reloadBtn = document.createElement("button");
	reloadBtn.type = "button";
	reloadBtn.className = "btn";
	reloadBtn.textContent = LL.reloadFromDisk();
	const keepBtn = document.createElement("button");
	keepBtn.type = "button";
	keepBtn.className = "btn";
	keepBtn.textContent = LL.keepMine();
	conflictBar.append(conflictText, reloadBtn, keepBtn);

	container.appendChild(area);

	// ProseMirror follows the caret to 5px off the column's floor. Keep the bottom
	// third clear instead, and keep the caret out from under the sticky format bar.
	// Getters because ProseMirror reads these on every scroll and the column resizes.
	//
	// Typewriter mode narrows that to a band around the middle, so the page moves
	// under the caret on every new line. The band has to be taller than the caret
	// (an h1 is about 36px) or ProseMirror flips the caret between its two edges.
	const typewriter = () => store.get("focusMode") && store.get("typewriter");
	const TYPEWRITER_BAND = 24;
	const caretMargin = {
		get top() {
			return typewriter()
				? scroll.clientHeight / 2 - TYPEWRITER_BAND
				: formatDock.offsetHeight + 24;
		},
		get bottom() {
			return typewriter()
				? scroll.clientHeight / 2 - TYPEWRITER_BAND
				: scroll.clientHeight / 3;
		},
		left: 0,
		right: 0,
	};

	const editor = new Editor({
		element: editorContent,
		editorProps: {
			scrollThreshold: caretMargin,
			scrollMargin: caretMargin,
		},
		extensions: [
			// Link's own click handler opens any link on a plain click, which
			// takes the caret away from a writer editing the linked words. The
			// listener on the view below follows links on Mod+click instead.
			StarterKit.configure({ link: { openOnClick: false } }),
			ParagraphStyle,
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

	// After the Editor: the format row needs it. The dock is already in place,
	// so the bar lands above the text without re-ordering the column.
	const formatBar = createFormatToolbar(formatDock, editor);
	attachResearchPreview(editor.view.dom);

	// A plain click in a chapter places the caret. Mod+click follows the link,
	// and so does any click in read-only research, which has no caret to place.
	editor.view.dom.addEventListener("click", (event) => {
		const href = (event.target as Element).closest?.("a")?.getAttribute("href");
		if (!href) return;
		// Never the webview's own navigation, which would replace the whole app.
		// Whether a click on a link inside contenteditable navigates differs
		// between WebKit and WebView2, so it is refused on every click.
		event.preventDefault();
		const follow =
			!editor.isEditable || (isMac ? event.metaKey : event.ctrlKey);
		if (!follow) return;

		const id = researchIdFromHref(href);
		if (id) {
			// From research to research, Back still leads to the chapter
			const active = store.get("activeDoc");
			const from = isResearch(active) ? store.get("researchReturn") : active;
			void openResearchById(id, from);
		} else if (/^https?:\/\//i.test(href)) {
			void openUrl(href).catch(console.error);
		}
	});
	createStyleDropdown(formatBar, editor);
	area.appendChild(scroll);
	area.appendChild(conflictBar);

	// The editor holds the content, so the editor owns the save.
	let dirty = false;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<void> = Promise.resolve();
	// The body as it stands on disk, last we knew: the one loaded or the one we
	// wrote. HTML because the load path already hands it over that way, and
	// because the file's body comes back with a leading blank line the markdown we
	// sent does not have, which marked ignores.
	let diskHtml = "";
	// While the bar is up, nothing saves on its own. An explicit save (Cmd+S, a
	// switch, the close) still goes through, and counts as Keep mine: refusing it
	// would lose the typing instead.
	let conflict = false;

	function markDirty() {
		dirty = true;
		clearTimeout(saveTimer);
		if (conflict) return;
		saveTimer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
	}

	function setConflict(on: boolean) {
		conflict = on;
		conflictBar.hidden = !on;
		if (on) clearTimeout(saveTimer);
	}

	// Never rejects: flush() chains on its result, and one rejection would poison
	// that chain and silently kill every later save. Everything fallible — the
	// markdown conversion included — stays inside the try.
	async function persist(force: boolean) {
		clearTimeout(saveTimer);
		const doc = store.get("activeDoc");
		const projectPath = store.get("projectPath");
		if (!doc || !projectPath) return;
		if (!dirty) {
			// An explicit save has to answer. `set` notifies unconditionally, so
			// re-stating "saved" re-stamps the status bar's clock — and the file on
			// disk really is saved as of that moment. No saveError to clear: this
			// branch needs !dirty, and a failed write re-arms dirty below.
			if (force) store.set("saveState", "saved");
			return;
		}

		try {
			// Snapshotting the HTML one microtask after the caller is soon enough: the
			// sidebar only swaps activeDoc after readChapter's IPC round-trip returns.
			const markdown = htmlToMarkdown(editor.getHTML());
			dirty = false;
			store.set("saveState", "saving");

			const saved = await saveChapter(projectPath, doc.id, markdown);
			diskHtml = markdownToHtml(markdown);
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
			store.set("saveError", null);
			store.set("saveState", "saved");
		} catch (err) {
			// Re-arm the flag so the edit outlives the failure. The next keystroke,
			// Cmd+S, chapter switch or close flush retries it.
			// ponytail: no backoff timer — add one if writes start failing for real.
			dirty = true;
			// Set the reason first: `set` notifies synchronously, and the statusbar
			// reads it when saveState fires.
			store.set("saveError", String(err));
			store.set("saveState", "error");
			console.error(err);
		}
	}

	// Chain rather than replace. Typing during a save leaves the editor dirty again,
	// so a plain `inFlight = persist()` would drop the reference to the write still
	// in the air: two writes race for one file, and the close stops waiting for the
	// older one. save_chapter reads the file then rewrites it, so an out-of-order
	// landing would persist the stale body — or truncate it if the window dies
	// mid-write. Queueing costs one microtask when there is nothing to save.
	async function flush(force = false) {
		clearTimeout(saveTimer);
		// The timer is never armed during a conflict, so any flush that gets here
		// is an explicit one, and the editor's text wins
		setConflict(false);
		inFlight = inFlight.then(() => persist(force));
		await inFlight;
	}

	reloadBtn.addEventListener("click", () => {
		const doc = store.get("activeDoc");
		setConflict(false);
		// document:load clears dirty, so the edits on screen go with the reload
		if (doc) void openChapter(doc);
	});
	keepBtn.addEventListener("click", () => {
		void flush(true);
	});

	// The watcher reports our own saves as well as other apps' writes. What is on
	// disk tells them apart: if it matches what we last loaded or wrote, nothing
	// happened that the editor does not already show.
	bus.on("docs:changed", async (ids) => {
		try {
			// A save still in the air has to land first, or the read below sees the
			// file before our own write and takes it for someone else's
			await inFlight;
			const doc = store.get("activeDoc");
			const projectPath = store.get("projectPath");
			if (!doc || !projectPath) return;

			let external = ids.some((id) => id !== doc.id);
			if (ids.includes(doc.id)) {
				// Chapter-only because only chapters open in the editor today. A new
				// kind that opens here brings its own read, and this follows it.
				const { body } = await readChapter(projectPath, doc.id);
				if (markdownToHtml(body) !== diskHtml) {
					external = true;
					if (dirty) setConflict(true);
					else await openChapter(doc);
				}
			}
			if (external) await refreshDocuments();
		} catch (err) {
			// The open file deleted from under us lands here. The next save fails
			// on it too, and the status bar shows that.
			console.error(err);
		}
	});

	// `change` fires on Enter and on blur-after-edit, so one listener covers both
	// ways of committing a rename.
	toolbarTitle.addEventListener("change", () => {
		const doc = store.get("activeDoc");
		if (!doc) return;
		// A pasted title can carry newlines the field will happily wrap; a chapter
		// name is one line.
		const title = toolbarTitle.value.replace(/\s+/g, " ").trim();
		// Enter commits and blur commits, so an unchanged name would be sent twice.
		if (title === doc.title) {
			setTitle(doc.title);
			return;
		}
		// Flush the body first so a pending autosave cannot interleave with the rename
		void flush()
			.then(() => commitRename(doc, title))
			.then((result) => {
				// Enter leaves the field focused, so a rejected name stays open to be
				// fixed. A click-away does not, and stealing focus back would fight it.
				if (result === "duplicate" && document.activeElement === toolbarTitle) {
					toolbarTitle.select();
					return;
				}
				setTitle(store.get("activeDoc")?.title ?? doc.title);
			});
	});

	// ponytail: the sidebar's chapter switch and main.ts's new-chapter path emit
	// this too, so they re-stamp the clock as well. Both are a "commit now" intent
	// and the stamp is true, so no second event to single out Cmd+S.
	bus.on("document:save", () => {
		void flush(true);
	});

	// Load document content
	bus.on("document:load", (doc: Doc) => {
		// Back only means something while research opened from a chapter is up
		if (!isResearch(doc)) store.set("researchReturn", null);
		// Research opens read-only (F-106): nothing saves it, so nothing may edit
		// it. The format bar goes too, because TipTap commands still change a
		// document the view will not let you type into.
		const readOnly = isResearch(doc);
		// No update event: it would mark the document dirty for a load
		editor.setEditable(!readOnly, false);
		formatDock.hidden = readOnly;
		toolbarTitle.readOnly = readOnly;
		editor.commands.setContent(doc.content || "");
		diskHtml = doc.content;
		setConflict(false);
		// setContent fires onUpdate, so the flag clears after it, not before
		clearTimeout(saveTimer);
		// ponytail: switching chapters while a save is failing drops that edit — the
		// sidebar flushes first, so this only bites when the retry fails too. The
		// indicator stays on Error. Queue the pending write per chapter if it matters.
		dirty = false;
		setTitle(doc.title);
		store.set("stats", computeStats(editor));
		store.set("outline", computeOutline(editor));
	});

	// A rename from the sidebar moves activeDoc without reloading the document, so
	// the toolbar has to follow the store rather than only the load event. Skipped
	// while the field has focus, or it would overwrite what is being typed into it.
	store.on("activeDoc", (doc) => {
		if (doc && document.activeElement !== toolbarTitle) {
			setTitle(doc.title);
		}
		showEyebrow(doc?.id);
		showBack(doc);
	});

	// scrollHeight is the wrapped height, so the field has to be collapsed before
	// it is measured or it can only ever grow. Detached (0) means the page is not
	// mounted yet and a later setTitle will size it.
	function fitTitle() {
		toolbarTitle.style.height = "auto";
		if (toolbarTitle.scrollHeight > 0) {
			toolbarTitle.style.height = `${toolbarTitle.scrollHeight}px`;
		}
	}

	function setTitle(text: string) {
		toolbarTitle.value = text;
		fitTitle();
	}

	toolbarTitle.addEventListener("input", fitTitle);

	// font-size is 4vw, so zooming the window regrows the text while the height
	// stays where the last keystroke left it. Watch the scroller, whose box comes
	// from the flex layout: observing the field or the page would see fitTitle's
	// own write and re-trigger on it.
	new ResizeObserver(fitTitle).observe(scroll);

	// A textarea's `change` only fires on blur, and Enter would open a second line
	// instead. Committing in place keeps the field focused, which is what lets a
	// rejected name stay open to be fixed.
	toolbarTitle.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			toolbarTitle.dispatchEvent(new Event("change"));
		}
	});

	// The chapter's position in the manuscript, counted over the tree rather
	// than stored: a reorder has to move it, and nothing writes it down.
	function showEyebrow(id: string | undefined) {
		const tree = store.get("projectMeta")?.tree;
		const at = id
			? (tree?.flatMap((node) => itemIds(node)).indexOf(id) ?? -1)
			: -1;
		eyebrow.textContent = at >= 0 ? LL.chapterEyebrow({ n: at + 1 }) : "";
	}

	function showBack(doc: Doc | null) {
		const from = store.get("researchReturn");
		backButton.hidden = !(from && isResearch(doc));
		if (from) backButton.textContent = LL.backTo({ title: from.title });
	}

	backButton.addEventListener("click", () => {
		const from = store.get("researchReturn");
		if (!from) return;
		// The listing's copy, when there is one: a save while away moved its counts
		const fresh = store.get("documents").find((d) => d.id === from.id);
		void openChapter(fresh ?? from);
	});

	// A reorder changes the count without changing which chapter is open.
	store.on("projectMeta", () => {
		showEyebrow(store.get("activeDoc")?.id);
	});

	// Scroll to heading from outline click
	bus.on("editor:scroll-to", (item: OutlineItem) => {
		// computeOutline collects headings of any level, and the two lists are
		// matched by position, so this selector has to span the same range.
		const headings = editorContent.querySelectorAll("h1, h2, h3, h4");
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

	// The bus emits synchronously and drops the returned promise, so a caller that
	// has to wait for the write — the window close — needs the function itself.
	return { flush };
}
