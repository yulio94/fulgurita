import { confirm } from "@tauri-apps/plugin-dialog";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { getLL, getLocale, resolveLocale } from "../../i18n";
import { type IconName, icon } from "../../services/icons";
import { setProjectLanguage, setProjectType } from "../../services/invoke";
import { createLanguageSelect } from "../../services/languages";
import type { ProjectMeta, ThemePref } from "../../types";
import styles from "./settings.module.css";

type LL = ReturnType<typeof getLL>;

let overlay: HTMLElement | null = null;

// Set when the interface language is changed in THIS session, and asked about on
// the way out. Deliberately not set for a restart owed by an earlier session:
// the hint already says so standing, and re-asking every time the window closes
// would nag someone who only came in to move the word goal.
let askToRestart = false;

/** The floor for the daily goal. The statusbar divides by it. */
const MIN_DAILY_GOAL = 50;

/**
 * Wires the modal to the bus. App-scoped: it mounts at boot, not with the
 * editor, because the application pages are worth opening with no project.
 */
export function createSettings() {
	bus.on("settings:open", open);
}

function open() {
	if (overlay) return;
	const LL = getLL();
	askToRestart = false;

	overlay = document.createElement("div");
	overlay.className = "modal";

	const card = document.createElement("div");
	card.className = "modal-card modal-wide";
	card.setAttribute("role", "dialog");
	card.setAttribute("aria-modal", "true");
	card.setAttribute("aria-labelledby", "settings-title");

	const header = document.createElement("div");
	header.className = styles.header;

	const title = document.createElement("h2");
	title.id = "settings-title";
	title.className = styles.title;
	title.textContent = LL.settingsTitle();

	// No Done button: every field saves on change, so closing is all that is left.
	const btnClose = document.createElement("button");
	btnClose.className = "btn-icon";
	btnClose.setAttribute("aria-label", LL.close());
	btnClose.title = LL.close();
	btnClose.appendChild(icon("close"));
	header.append(title, btnClose);

	const content = document.createElement("div");
	content.className = styles.content;

	// Project settings only exist while a project does. The window still opens
	// without one — the application pages are the reason Cmd+, works on the
	// start screen.
	const pages: [IconName, string, HTMLElement[]][] = [];
	const meta = store.get("projectMeta");
	if (meta) {
		pages.push([
			"folder",
			LL.settingsSectionProject(),
			projectPage(LL, content, meta),
		]);
	}
	pages.push(
		["sun", LL.settingsSectionAppearance(), appearancePage(LL)],
		["rename", LL.settingsSectionWriting(), writingPage(LL)],
		["globe", LL.settingsSectionLanguage(), languagePage(LL)],
	);

	const nav = document.createElement("nav");
	nav.className = styles.nav;

	// Every page is built up front and only hidden, so a field keeps its state
	// while you look at another page.
	const items: HTMLButtonElement[] = [];
	const sections: HTMLElement[] = [];
	const show = (index: number) => {
		sections.forEach((section, i) => {
			section.hidden = i !== index;
		});
		items.forEach((item, i) => {
			if (i === index) item.setAttribute("aria-current", "page");
			else item.removeAttribute("aria-current");
		});
	};

	pages.forEach(([iconName, label, fields], i) => {
		const item = document.createElement("button");
		item.className = styles.navItem;
		item.append(icon(iconName), label);
		item.addEventListener("click", () => show(i));
		nav.appendChild(item);
		items.push(item);

		const section = document.createElement("section");
		const heading = document.createElement("h3");
		heading.className = styles.pageTitle;
		heading.textContent = label;
		section.append(heading, ...fields);
		content.appendChild(section);
		sections.push(section);
	});
	show(0);

	const body = document.createElement("div");
	body.className = styles.body;
	body.append(nav, content);

	card.append(header, body);
	overlay.appendChild(card);
	document.body.appendChild(overlay);

	requestAnimationFrame(() => content.querySelector("select")?.focus());

	btnClose.addEventListener("click", close);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) close();
	});
	card.addEventListener("keydown", (e) => {
		if (e.key === "Escape") close();
	});
}

/**
 * One setting: its name, what it does, then the control. The control carries
 * the id, and the label and hint hang off it.
 */
function field(
	label: string,
	control: HTMLElement,
	hint: string | HTMLElement,
): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = styles.field;

	const labelEl = document.createElement("label");
	labelEl.className = styles.label;
	labelEl.htmlFor = control.id;
	labelEl.textContent = label;

	let hintEl: HTMLElement;
	if (typeof hint === "string") {
		hintEl = document.createElement("div");
		hintEl.className = styles.hint;
		hintEl.textContent = hint;
	} else {
		hintEl = hint;
	}
	hintEl.id = `${control.id}-hint`;
	control.setAttribute("aria-describedby", hintEl.id);

	wrap.append(labelEl, hintEl, control);
	return wrap;
}

/** What this project is, and what language it is written in. */
function projectPage(
	LL: LL,
	content: HTMLElement,
	meta: ProjectMeta,
): HTMLElement[] {
	const typeSelect = createProjectTypeSelect(LL, meta.project_type);
	typeSelect.id = "settings-project-type";

	typeSelect.addEventListener("change", async () => {
		const path = store.get("projectPath");
		const current = store.get("projectMeta");
		if (!path || !current) return;

		try {
			const next = await setProjectType(path, typeSelect.value);
			// Patch, never re-read — the tree here is the one open_project pruned
			// in memory, and a fresh load would put the orphans back.
			store.set("projectMeta", { ...current, project_type: next });
		} catch (err) {
			typeSelect.value = current.project_type;
			showError(content, String(err));
		}
	});

	// ponytail: the same picker as the interface language, because today both
	// lists are `locales`. They are not the same list — a manuscript is not
	// limited to the languages Fulgurita is translated into. F-046 gives this one
	// the installed dictionaries and the two diverge then, not before.
	const select = createLanguageSelect(meta.language);
	select.id = "settings-language";

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
			showError(content, String(err));
		}
	});

	return [
		field(LL.projectTypeLabel(), typeSelect, LL.projectTypeHint()),
		field(LL.projectLanguageLabel(), select, LL.projectLanguageHint()),
	];
}

/**
 * The project types the picker offers, in menu order.
 *
 * ponytail: built here rather than in a service, because settings is the only
 * caller. It moves out when the new-project form or F-074 becomes a second one.
 * A value we do not know — hand-edited, or an F-082 plugin's — gets an option
 * of its own, the way `createLanguageSelect` handles a language we do not ship.
 */
function createProjectTypeSelect(LL: LL, value: string): HTMLSelectElement {
	const known: [string, string][] = [
		["novel", LL.projectTypeNovel()],
		["longform", LL.projectTypeLongform()],
		["thesis", LL.projectTypeThesis()],
		["blog", LL.projectTypeBlog()],
	];
	if (!known.some(([id]) => id === value)) known.push([value, value]);

	const select = document.createElement("select");
	for (const [id, text] of known) {
		const option = document.createElement("option");
		option.value = id;
		option.textContent = text;
		select.appendChild(option);
	}
	select.value = value;
	return select;
}

// The pages below outlive any one project. Persisted by services/config.ts.

function appearancePage(LL: LL): HTMLElement[] {
	// themeDay and themeNight already read as names rather than verbs, so the
	// titlebar's two labels carry over as the two explicit options.
	const theme = document.createElement("select");
	theme.id = "settings-theme";
	for (const [value, text] of [
		["system", LL.themeSystem()],
		["light", LL.themeDay()],
		["dark", LL.themeNight()],
	]) {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = text;
		theme.appendChild(option);
	}
	theme.value = store.get("theme");

	// No restart prompt, unlike the language page: services/theme.ts is
	// subscribed and repaints on the way out of this line.
	theme.addEventListener("change", () => {
		store.set("theme", theme.value as ThemePref);
	});

	return [field(LL.themeLabel(), theme, LL.themeHint())];
}

function writingPage(LL: LL): HTMLElement[] {
	// ponytail: a native number input. min/step drive the spinner and the
	// keyboard for free, but they do not stop anyone typing 0 — the clamp below
	// is what keeps the statusbar's division honest.
	const goal = document.createElement("input");
	goal.type = "number";
	goal.id = "settings-daily-goal";
	goal.min = String(MIN_DAILY_GOAL);
	goal.step = "50";
	goal.value = String(store.get("dailyGoal"));

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

	// A select rather than a checkbox: the modal styles every input as a text
	// field, and a select already lines up with the fields around it.
	const typewriter = document.createElement("select");
	typewriter.id = "settings-typewriter";
	for (const [value, text] of [
		["off", LL.typewriterOff()],
		["focus", LL.typewriterInFocus()],
	]) {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = text;
		typewriter.appendChild(option);
	}
	typewriter.value = store.get("typewriter") ? "focus" : "off";
	typewriter.addEventListener("change", () => {
		store.set("typewriter", typewriter.value === "focus");
	});

	return [
		field(LL.dailyGoalLabel(), goal, LL.dailyGoalHint()),
		field(LL.typewriterLabel(), typewriter, LL.typewriterHint()),
	];
}

function languagePage(LL: LL): HTMLElement[] {
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
		askToRestart = renderLocaleHint();
	});

	// Against what is on screen, not against what is stored: someone who changed
	// the language and reopened this window still has a restart owed, and the
	// stored value would say everything is fine. Rendered up front for that case,
	// and it goes quiet again if they pick the running language back.
	function renderLocaleHint(): boolean {
		const pending = resolveLocale(localeSelect.value) !== getLocale();
		localeHint.className = pending
			? `${styles.hint} ${styles.hintPending}`
			: styles.hint;
		localeHint.textContent = pending
			? LL.appLanguageRestart()
			: LL.appLanguageHint();
		return pending;
	}
	renderLocaleHint();

	return [field(LL.appLanguageLabel(), localeSelect, localeHint)];
}

function close() {
	overlay?.remove();
	overlay = null;
	if (!askToRestart) return;
	askToRestart = false;
	// After the card is gone, not while it is up: the question is about the app,
	// and stacking a system dialog over our own modal reads as two problems.
	void offerRestart();
}

/**
 * Asks on the way out, which is the one moment the answer is actionable and the
 * window is not in the way. Declining costs nothing — the choice is already
 * persisted and the next launch picks it up regardless.
 */
async function offerRestart() {
	const LL = getLL();
	try {
		const yes = await confirm(LL.restartPrompt(), {
			okLabel: LL.restartNow(),
			cancelLabel: LL.restartLater(),
		});
		if (yes) bus.emit("app:restart");
	} catch {
		// Not running in Tauri (e.g. browser-only dev) — nothing to restart
	}
}

function showError(content: HTMLElement, message: string) {
	let el = content.querySelector<HTMLElement>(".modal-error");
	if (!el) {
		el = document.createElement("div");
		el.className = "modal-error";
		content.appendChild(el);
	}
	el.textContent = message;
}
