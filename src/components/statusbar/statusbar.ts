import { estimatePages, WORDS_PER_PAGE } from "../../core/formats";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import type { Doc, SaveState } from "../../types";
import styles from "./statusbar.module.css";

// The project total is a sum over the chapter counts the backend already returns
// on every list and save. The open chapter is the one exception: its stored count
// is an autosave behind, so the editor's live figure stands in for it.
//
// ponytail: the two figures come from different rules — Rust counts the markdown
// source, the editor counts rendered text — so the total can shift by a word or
// two when a chapter closes. Unify the two counters if it ever has to be exact.
export function projectWords(
	docs: Doc[],
	activeId: string | undefined,
	activeWords: number,
): number {
	return docs.reduce(
		(sum, doc) => sum + (doc.id === activeId ? activeWords : doc.words),
		0,
	);
}

export function createStatusbar(container: HTMLElement) {
	const LL = getLL();
	const locale = store.get("locale");
	const signed = (n: number) =>
		n.toLocaleString(locale, { signDisplay: "exceptZero" });

	const bar = document.createElement("div");
	bar.className = styles.statusbar;

	const left = document.createElement("div");
	left.className = styles.left;

	const wordCount = document.createElement("span");
	wordCount.className = styles.statText;

	// Sits next to the word count because it is the same quantity in another
	// unit. The tilde says "estimate" at a glance; the tooltip spells it out and
	// carries the second format, which does not fit in a bar this narrow.
	const pageCount = document.createElement("span");
	pageCount.className = `${styles.statText} ${styles.hint}`;

	const sessionCount = document.createElement("span");
	sessionCount.className = styles.statText;

	const charCount = document.createElement("span");
	charCount.className = styles.statText;

	const readTime = document.createElement("span");
	readTime.className = styles.statText;

	const saveState = document.createElement("span");
	saveState.className = styles.statText;
	saveState.textContent = LL.saveStateSaved();

	left.append(
		wordCount,
		pageCount,
		sessionCount,
		charCount,
		readTime,
		saveState,
	);

	const right = document.createElement("div");
	right.className = styles.right;

	const progressTrack = document.createElement("div");
	progressTrack.className = styles.progressTrack;
	const progressFill = document.createElement("div");
	progressFill.className = styles.progressFill;
	progressTrack.appendChild(progressFill);

	const goalText = document.createElement("span");
	goalText.className = styles.goalText;

	right.append(progressTrack, goalText);

	bar.append(left, right);
	container.appendChild(bar);

	// Words at the moment the project opened. The statusbar is rebuilt on every
	// project load, so the session resets with it and needs no reset of its own.
	let baseline: number | null = null;

	function render() {
		const stats = store.get("stats");
		const docs = store.get("documents");
		const total = projectWords(docs, store.get("activeDoc")?.id, stats.words);

		// `documents` is empty until the chapters come back off disk, and is set
		// before the first chapter opens — so the first non-empty render still has
		// activeDoc null and the total is the honest on-disk figure. That is the
		// number the session measures from.
		if (baseline === null && docs.length > 0) baseline = total;
		const session = baseline === null ? 0 : total - baseline;

		wordCount.textContent = LL.wordCountOf({
			count: stats.words.toLocaleString(locale),
			total: total.toLocaleString(locale),
		});
		const trade = estimatePages(total, WORDS_PER_PAGE.trade6x9);
		const manuscript = estimatePages(total, WORDS_PER_PAGE.manuscript);
		pageCount.textContent = LL.pageCount({
			count: trade.toLocaleString(locale),
			pages: trade,
		});
		pageCount.title = LL.pageEstimateHint({
			trade: trade.toLocaleString(locale),
			manuscript: manuscript.toLocaleString(locale),
		});
		sessionCount.textContent = LL.sessionWords({ count: signed(session) });
		charCount.textContent = LL.charCount({ count: stats.characters });
		readTime.textContent = LL.readTimeStatus({ time: stats.readingTime });

		// Cutting more than you wrote puts the session below zero. The number stays
		// honest, the bar clamps — there is no negative width to paint.
		const goal = store.get("dailyGoal");
		const pct = Math.max(0, Math.min(100, Math.round((session / goal) * 100)));
		progressFill.style.width = `${pct}%`;
		goalText.textContent = LL.goalProgress({
			current: signed(session),
			goal: goal.toLocaleString(locale),
		});
	}

	// Not `activeDoc`: openChapter sets it before emitting document:load, which is
	// what refreshes the stats. Rendering in that gap would pair the new chapter's
	// id with the old chapter's word count and the total would flicker.
	store.on("stats", render);
	store.on("documents", render);
	// The goal is the bar's denominator, so settings has to move it without
	// waiting for the next keystroke to push new stats through.
	store.on("dailyGoal", render);
	render();

	// A local write returns in a millisecond or two, so "Saving…" never survives to
	// a paint and a bare "Saved" reads as static text. The clock time is the part
	// that visibly moves, which is the reassurance the indicator is here to give.
	// No live region: announcing every save would talk over the writer.
	const saveLabel = (state: SaveState) => {
		if (state === "saving") return LL.saveStateSaving();
		if (state === "error") return LL.saveStateError();
		return LL.saveStateSavedAt({
			time: new Date().toLocaleTimeString(locale, {
				hour: "2-digit",
				minute: "2-digit",
			}),
		});
	};

	store.on("saveState", (state: SaveState) => {
		saveState.textContent = saveLabel(state);
		saveState.classList.toggle(styles.saveError, state === "error");
		// The label has room for one word. A refused write is not a transient
		// failure — it names a file the writer has to open and repair — so the
		// whole sentence has to be reachable from here.
		const why = state === "error" ? store.get("saveError") : null;
		if (why) saveState.title = why;
		else saveState.removeAttribute("title");
	});
}
