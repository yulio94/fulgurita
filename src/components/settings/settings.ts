import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL, getLocale, resolveLocale } from "../../i18n";
import { setProjectLanguage } from "../../services/invoke";
import { createLanguageSelect } from "../../services/languages";
import styles from "./settings.module.css";

let overlay: HTMLElement | null = null;

/** The floor for the daily goal. The statusbar divides by it. */
const MIN_DAILY_GOAL = 50;

/**
 * Wires the modal to the bus. App-scoped: it mounts at boot, not with the
 * editor, because the Application section is worth opening with no project.
 */
export function createSettings() {
	bus.on("settings:open", open);
}

function open() {
	if (overlay) return;
	const LL = getLL();

	overlay = document.createElement("div");
	overlay.className = "modal";

	const card = document.createElement("div");
	card.className = "modal-card";

	const title = document.createElement("div");
	title.className = "modal-title";
	title.textContent = LL.settingsTitle();
	card.appendChild(title);

	// Project settings only exist while a project does. The window still opens
	// without one — the Application section below is the reason Cmd+, works on
	// the start screen.
	const meta = store.get("projectMeta");
	if (meta) card.appendChild(projectSection(LL, card, meta.language));
	card.appendChild(appSection(LL));

	const actions = document.createElement("div");
	actions.className = "modal-actions";

	const btnDone = document.createElement("button");
	btnDone.className = "btn btn-primary";
	btnDone.textContent = LL.done();
	actions.appendChild(btnDone);

	card.appendChild(actions);
	overlay.appendChild(card);
	document.body.appendChild(overlay);

	requestAnimationFrame(() => card.querySelector("select")?.focus());

	btnDone.addEventListener("click", close);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) close();
	});
	card.addEventListener("keydown", (e) => {
		if (e.key === "Escape") close();
	});
}

/** The manuscript's language. Not the interface's — see appSection. */
function projectSection(
	LL: ReturnType<typeof getLL>,
	card: HTMLElement,
	language: string,
): HTMLElement {
	const section = document.createElement("div");
	section.className = styles.section;
	section.appendChild(sectionTitle(LL.settingsSectionProject()));

	const label = document.createElement("label");
	label.className = "modal-label";
	label.htmlFor = "settings-language";
	label.textContent = LL.projectLanguageLabel();

	// ponytail: the same picker as the interface language, because today both
	// lists are `locales`. They are not the same list — a manuscript is not
	// limited to the languages Sietch is translated into. F-046 gives this one
	// the installed dictionaries and the two diverge then, not before.
	const select = createLanguageSelect(language);
	select.id = "settings-language";

	const hint = document.createElement("div");
	hint.className = styles.hint;
	hint.textContent = LL.projectLanguageHint();

	// On change, not on a Save button. Every field here is reversible.
	select.addEventListener("change", async () => {
		const path = store.get("projectPath");
		const current = store.get("projectMeta");
		if (!path || !current) return;

		try {
			const next = await setProjectLanguage(path, select.value);
			// Patch the store, never re-read it. The tree here is the one
			// open_project pruned in memory, and sidebar.ts rebuilds itself on
			// every projectMeta set — a fresh load would put the orphans back.
			store.set("projectMeta", { ...current, language: next });
		} catch (err) {
			select.value = current.language;
			showError(card, String(err));
		}
	});

	section.append(label, select, hint);
	return section;
}

/** Settings that outlive any one project. Persisted by services/config.ts. */
function appSection(LL: ReturnType<typeof getLL>): HTMLElement {
	const section = document.createElement("div");
	section.className = styles.section;
	section.appendChild(sectionTitle(LL.settingsSectionApp()));

	// ── Daily goal ──
	const goalLabel = document.createElement("label");
	goalLabel.className = "modal-label";
	goalLabel.htmlFor = "settings-daily-goal";
	goalLabel.textContent = LL.dailyGoalLabel();

	// ponytail: a native number input. min/step drive the spinner and the
	// keyboard for free, but they do not stop anyone typing 0 — the clamp below
	// is what keeps the statusbar's division honest.
	const goal = document.createElement("input");
	goal.type = "number";
	goal.id = "settings-daily-goal";
	goal.min = String(MIN_DAILY_GOAL);
	goal.step = "50";
	goal.value = String(store.get("dailyGoal"));

	const goalHint = document.createElement("div");
	goalHint.className = styles.hint;
	goalHint.textContent = LL.dailyGoalHint();

	// On change, not input: committing per keystroke would write "5" on the way
	// to "500" and persist it.
	goal.addEventListener("change", () => {
		const parsed = Number.parseInt(goal.value, 10);
		const next = Number.isNaN(parsed)
			? store.get("dailyGoal")
			: Math.max(MIN_DAILY_GOAL, Math.round(parsed));
		goal.value = String(next);
		store.set("dailyGoal", next);
	});

	// ── Interface language ──
	const localeLabel = document.createElement("label");
	localeLabel.className = "modal-label";
	localeLabel.htmlFor = "settings-app-language";
	localeLabel.textContent = LL.appLanguageLabel();

	// The resolved locale, not the raw persisted string. config.json is editable
	// by hand, and an unknown tag would otherwise get an option of its own here —
	// which is right for a manuscript and wrong for the interface, since the
	// interface only has the languages it is translated into.
	const localeSelect = createLanguageSelect(resolveLocale(store.get("locale")));
	localeSelect.id = "settings-app-language";

	const localeHint = document.createElement("div");

	// Persisting is the whole of it: config.ts auto-saves `locale` and main.ts
	// re-inits i18n from it at boot. Relabelling the running app would mean
	// rebuilding every component that read its strings at construction, which is
	// most of them — hence a restart rather than a remount.
	localeSelect.addEventListener("change", () => {
		store.set("locale", localeSelect.value);
		renderLocaleHint();
	});

	// Against what is on screen, not against what is stored: someone who changed
	// the language and reopened this window still has a restart owed, and the
	// stored value would say everything is fine. Rendered up front for that case,
	// and it goes quiet again if they pick the running language back.
	function renderLocaleHint() {
		const pending = resolveLocale(localeSelect.value) !== getLocale();
		localeHint.className = pending
			? `${styles.hint} ${styles.hintPending}`
			: styles.hint;
		localeHint.textContent = pending
			? LL.appLanguageRestart()
			: LL.appLanguageHint();
	}
	renderLocaleHint();

	section.append(
		goalLabel,
		goal,
		goalHint,
		localeLabel,
		localeSelect,
		localeHint,
	);
	return section;
}

function sectionTitle(text: string): HTMLElement {
	const el = document.createElement("div");
	el.className = styles.sectionTitle;
	el.textContent = text;
	return el;
}

function close() {
	overlay?.remove();
	overlay = null;
}

function showError(card: HTMLElement, message: string) {
	let el = card.querySelector<HTMLElement>(".modal-error");
	if (!el) {
		el = document.createElement("div");
		el.className = "modal-error";
		card.appendChild(el);
	}
	el.textContent = message;
}
