import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { commitSynopsis, commitTags } from "../../services/chapters";
import { icon } from "../../services/icons";
import { setTagColor } from "../../services/invoke";
import { suggestTags, TAG_COLORS, tagColorVar } from "../../services/tags";
import type { EditorStats, OutlineItem } from "../../types";
import styles from "./inspector.module.css";

/** The `<datalist>` the tag input reads. The Inspector mounts exactly once. */
const SUGGESTIONS_ID = "tag-suggestions";

export function createInspector(container: HTMLElement) {
	const LL = getLL();

	const inspector = document.createElement("div");
	inspector.className = styles.inspector;

	// Stats section
	const statsSection = document.createElement("div");
	statsSection.className = styles.section;
	const statsTitle = document.createElement("h3");
	statsTitle.className = styles.sectionTitle;
	statsTitle.textContent = LL.statistics();
	const statGrid = document.createElement("div");
	statGrid.className = styles.statGrid;
	statsSection.appendChild(statsTitle);
	statsSection.appendChild(statGrid);

	// Create stat cards
	const cards = createStatCards(statGrid, LL);

	// Synopsis section. Per-chapter metadata, so it sits with the tags rather
	// than above the stat grid — what the chapter is about, then how it is filed.
	const synopsisSection = document.createElement("div");
	synopsisSection.className = styles.section;
	const synopsisTitle = document.createElement("h3");
	synopsisTitle.className = styles.sectionTitle;
	synopsisTitle.textContent = LL.synopsis();
	const synopsisInput = document.createElement("textarea");
	synopsisInput.className = styles.synopsisInput;
	synopsisInput.placeholder = LL.synopsisPlaceholder();
	synopsisInput.setAttribute("aria-label", LL.synopsis());
	synopsisSection.appendChild(synopsisTitle);
	synopsisSection.appendChild(synopsisInput);

	// Tags section. Above the outline and the notes, which are the two blocks
	// that grow — per-chapter metadata sits with the stat grid.
	const tagsSection = document.createElement("div");
	tagsSection.className = styles.section;
	const tagsTitle = document.createElement("h3");
	tagsTitle.className = styles.sectionTitle;
	tagsTitle.textContent = LL.tags();

	const tagList = document.createElement("ul");
	tagList.className = styles.tagList;

	// The input and the datalist element are built once and never rebuilt, so a
	// render mid-typing cannot take the caret with it — and one does fire on
	// every keystroke in the notes textarea, which re-sets activeDoc.
	const tagInput = document.createElement("input");
	tagInput.className = styles.tagInput;
	tagInput.type = "text";
	tagInput.setAttribute("list", SUGGESTIONS_ID);
	tagInput.setAttribute("aria-label", LL.addTag());
	tagInput.placeholder = LL.addTagPlaceholder();

	const suggestions = document.createElement("datalist");
	suggestions.id = SUGGESTIONS_ID;

	// The chips and the add field are one wrapping row, so the field trails the
	// last chip the way the design draws it. tagList stays a <ul> for the
	// semantics and lays its items out in this row via display: contents —
	// renderTagList empties it on every change and would take the input with it.
	const tagRow = document.createElement("div");
	tagRow.className = styles.tagRow;
	tagRow.appendChild(tagList);
	tagRow.appendChild(tagInput);

	tagsSection.appendChild(tagsTitle);
	tagsSection.appendChild(tagRow);
	tagsSection.appendChild(suggestions);

	// Outline section
	const outlineSection = document.createElement("div");
	outlineSection.className = styles.section;
	const outlineTitle = document.createElement("h3");
	outlineTitle.className = styles.sectionTitle;
	outlineTitle.textContent = LL.outline();
	const outlineList = document.createElement("ul");
	outlineList.className = styles.outlineList;
	outlineSection.appendChild(outlineTitle);
	outlineSection.appendChild(outlineList);

	// Notes section
	const notesSection = document.createElement("div");
	notesSection.className = styles.section;
	const notesTitle = document.createElement("h3");
	notesTitle.className = styles.sectionTitle;
	notesTitle.textContent = LL.notes();
	const notesInput = document.createElement("textarea");
	notesInput.className = styles.notesInput;
	notesInput.placeholder = LL.notesPlaceholder();
	notesSection.appendChild(notesTitle);
	notesSection.appendChild(notesInput);

	inspector.appendChild(statsSection);
	inspector.appendChild(synopsisSection);
	inspector.appendChild(tagsSection);
	inspector.appendChild(outlineSection);
	inspector.appendChild(notesSection);
	container.appendChild(inspector);

	// Every path that adds a tag goes through here. Clearing the field first
	// makes the second call a no-op, which is what lets Enter and blur both fire.
	const commit = () => {
		const raw = tagInput.value.trim();
		tagInput.value = "";
		const doc = store.get("activeDoc");
		if (!raw || !doc) return;
		// Already on the chapter: silently nothing, not an error to explain
		if (doc.tags.some((tag) => tag.toLowerCase() === raw.toLowerCase())) return;
		void commitTags(doc, [...doc.tags, raw]);
	};

	tagInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === ",") {
			// The comma is the separator, so it must never land in the field
			event.preventDefault();
			commit();
		} else if (event.key === "Backspace" && tagInput.value === "") {
			const doc = store.get("activeDoc");
			if (!doc?.tags.length) return;
			event.preventDefault();
			void commitTags(doc, doc.tags.slice(0, -1));
		} else if (event.key === "Escape" && tagInput.value !== "") {
			// Only swallowed when there was something to clear, so an empty
			// field leaves Escape to whatever else wants it
			event.preventDefault();
			tagInput.value = "";
		}
	});

	// Half-typed text is not thrown away because the writer clicked into the
	// editor. The guard in commit() makes the overlap with Enter free.
	tagInput.addEventListener("blur", commit);

	const renderTags = () => {
		const doc = store.get("activeDoc");
		const colors = store.get("projectMeta")?.tag_colors ?? {};
		renderTagList(tagList, doc?.tags ?? [], colors, LL);
		renderSuggestions(
			suggestions,
			suggestTags(store.get("documents"), doc?.tags ?? []),
		);
	};

	// `immediate` because this section renders from these keys rather than
	// merely reacting to them — it has to be right before the first change.
	store.on("activeDoc", renderTags, { immediate: true });
	store.on("documents", renderTags, { immediate: true });
	store.on("projectMeta", renderTags, { immediate: true });

	// The synopsis writes on blur, the way the editor's title field does. A
	// debounce would buy nothing here: nobody types a summary a character at a
	// time the way they type a manuscript, and moving to another chapter blurs
	// the field first, so the write always lands before the doc changes.
	synopsisInput.addEventListener("change", () => {
		const doc = store.get("activeDoc");
		if (doc) void commitSynopsis(doc, synopsisInput.value);
	});

	// Load the synopsis when the doc changes, unless it is being edited — an
	// autosave writes activeDoc too, and it must not land on top of the typing.
	store.on(
		"activeDoc",
		(doc) => {
			if (document.activeElement === synopsisInput) return;
			synopsisInput.value = doc?.synopsis ?? "";
		},
		{ immediate: true },
	);

	// Notes save on input
	notesInput.addEventListener("input", () => {
		const doc = store.get("activeDoc");
		if (doc) {
			doc.notes = notesInput.value;
			store.set("activeDoc", doc);
		}
	});

	// Load notes when doc changes
	store.on("activeDoc", (doc) => {
		notesInput.value = doc?.notes ?? "";
	});

	// Update stats
	store.on("stats", (stats: EditorStats) => {
		cards.words.textContent = String(stats.words);
		cards.chars.textContent = String(stats.characters);
		cards.paragraphs.textContent = String(stats.paragraphs);
		cards.readTime.textContent = stats.readingTime;
	});

	// Update outline
	store.on("outline", (items: OutlineItem[]) => {
		renderOutline(outlineList, items);
	});
}

function createStatCards(grid: HTMLElement, LL: ReturnType<typeof getLL>) {
	const make = (label: string) => {
		const card = document.createElement("div");
		card.className = styles.statCard;
		const value = document.createElement("div");
		value.className = styles.statValue;
		value.textContent = "0";
		const lbl = document.createElement("div");
		lbl.className = styles.statLabel;
		lbl.textContent = label;
		card.appendChild(value);
		card.appendChild(lbl);
		grid.appendChild(card);
		return value;
	};

	return {
		words: make(LL.words()),
		chars: make(LL.characters()),
		paragraphs: make(LL.paragraphs()),
		readTime: make(LL.readingTimeLabel()),
	};
}

function renderTagList(
	list: HTMLElement,
	tags: string[],
	colors: Record<string, string>,
	LL: ReturnType<typeof getLL>,
) {
	list.textContent = "";
	for (const tag of tags) {
		const chip = document.createElement("li");
		chip.className = styles.tag;

		const swatch = createColorSelect(tag, colors[tag], LL);
		const name = document.createElement("span");
		name.className = styles.tagName;
		name.textContent = tag;

		const remove = document.createElement("button");
		remove.className = styles.tagRemove;
		remove.type = "button";
		remove.appendChild(icon("close", true));
		remove.setAttribute("aria-label", LL.removeTag({ tag }));
		remove.addEventListener("click", () => {
			const doc = store.get("activeDoc");
			if (doc)
				void commitTags(
					doc,
					doc.tags.filter((t) => t !== tag),
				);
		});

		chip.appendChild(swatch);
		chip.appendChild(name);
		chip.appendChild(remove);
		list.appendChild(chip);
	}
}

/**
 * The color picker: a native `<select>` stripped back to a dot. The keyboard,
 * the screen reader and the platform's own menu come free — the reasoning
 * `services/languages.ts` records, and the reason this is not the hand-rolled
 * listbox in `editor/style-dropdown.ts`.
 */
function createColorSelect(
	tag: string,
	color: string | undefined,
	LL: ReturnType<typeof getLL>,
): HTMLSelectElement {
	const labels: Record<(typeof TAG_COLORS)[number], string> = {
		clay: LL.tagColorClay(),
		olive: LL.tagColorOlive(),
		water: LL.tagColorWater(),
		plum: LL.tagColorPlum(),
		ember: LL.tagColorEmber(),
		sky: LL.tagColorSky(),
	};

	const select = document.createElement("select");
	select.className = styles.tagSwatch;
	select.setAttribute("aria-label", LL.tagColorLabel({ tag }));
	// An empty background is a tag with no color, and also a color name this
	// version does not know — a hand-edited fulgurita.json paints nothing.
	select.style.background = tagColorVar(color);

	const none = document.createElement("option");
	none.value = "";
	none.textContent = LL.tagColorDefault();
	select.appendChild(none);

	for (const name of TAG_COLORS) {
		const option = document.createElement("option");
		option.value = name;
		option.textContent = labels[name];
		select.appendChild(option);
	}
	select.value = TAG_COLORS.includes(color as (typeof TAG_COLORS)[number])
		? (color as string)
		: "";

	select.addEventListener("change", () => {
		const projectPath = store.get("projectPath");
		const meta = store.get("projectMeta");
		if (!projectPath || !meta) return;

		const next = { ...meta.tag_colors };
		if (select.value) next[tag] = select.value;
		else delete next[tag];

		void setTagColor(projectPath, tag, select.value)
			.then(() => store.set("projectMeta", { ...meta, tag_colors: next }))
			.catch((err) => {
				store.set("saveError", String(err));
				store.set("saveState", "error");
				console.error(err);
			});
	});
	return select;
}

function renderSuggestions(list: HTMLDataListElement, tags: string[]) {
	list.textContent = "";
	for (const tag of tags) {
		const option = document.createElement("option");
		option.value = tag;
		list.appendChild(option);
	}
}

function renderOutline(list: HTMLElement, items: OutlineItem[]) {
	list.textContent = "";
	for (const item of items) {
		const li = document.createElement("li");
		li.className =
			item.level > 1 ? styles.outlineItemIndent : styles.outlineItem;
		li.textContent = item.text;
		li.addEventListener("click", () => {
			bus.emit("editor:scroll-to", item);
		});
		list.appendChild(li);
	}
}
