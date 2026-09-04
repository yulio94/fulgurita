import { store } from "../../core/store";
import { getLL } from "../../i18n";
import type { EditorStats, SaveState } from "../../types";
import styles from "./statusbar.module.css";

export function createStatusbar(container: HTMLElement) {
	const LL = getLL();
	const locale = store.get("locale");

	const bar = document.createElement("div");
	bar.className = styles.statusbar;

	const left = document.createElement("div");
	left.className = styles.left;

	const wordCount = document.createElement("span");
	wordCount.className = styles.statText;
	wordCount.textContent = LL.wordCount({ count: 0 });

	const charCount = document.createElement("span");
	charCount.className = styles.statText;
	charCount.textContent = LL.charCount({ count: 0 });

	const readTime = document.createElement("span");
	readTime.className = styles.statText;
	readTime.textContent = LL.readTimeStatus({
		time: LL.readingTime({ minutes: 0 }),
	});

	const saveState = document.createElement("span");
	saveState.className = styles.statText;
	saveState.textContent = LL.saveStateSaved();

	left.appendChild(wordCount);
	left.appendChild(charCount);
	left.appendChild(readTime);
	left.appendChild(saveState);

	const right = document.createElement("div");
	right.className = styles.right;

	const progressTrack = document.createElement("div");
	progressTrack.className = styles.progressTrack;
	const progressFill = document.createElement("div");
	progressFill.className = styles.progressFill;
	progressFill.style.width = "0%";
	progressTrack.appendChild(progressFill);

	const goalText = document.createElement("span");
	goalText.className = styles.goalText;
	goalText.textContent = LL.goalProgress({
		current: (0).toLocaleString(locale),
		goal: (1000).toLocaleString(locale),
	});

	right.appendChild(progressTrack);
	right.appendChild(goalText);

	bar.appendChild(left);
	bar.appendChild(right);
	container.appendChild(bar);

	store.on("stats", (stats: EditorStats) => {
		wordCount.textContent = LL.wordCount({ count: stats.words });
		charCount.textContent = LL.charCount({ count: stats.characters });
		readTime.textContent = LL.readTimeStatus({ time: stats.readingTime });

		const goal = store.get("dailyGoal");
		const pct = Math.min(100, Math.round((stats.words / goal) * 100));
		progressFill.style.width = `${pct}%`;
		goalText.textContent = LL.goalProgress({
			current: stats.words.toLocaleString(locale),
			goal: goal.toLocaleString(locale),
		});
	});

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
	});
}
