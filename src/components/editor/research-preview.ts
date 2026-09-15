import { openUrl } from "@tauri-apps/plugin-opener";
import { store } from "../../core/store";
import { getLL } from "../../i18n";
import { markdownToHtml } from "../../services/chapters";
import { readResearch, readResearchImage } from "../../services/invoke";
import {
	findResearchItem,
	host,
	isResearch,
	loadResearch,
	openResearchById,
	researchIdFromHref,
} from "../../services/research";
import styles from "./research-preview.module.css";

const SHOW_DELAY_MS = 300;
// Long enough to cross the gap between the link and the card below it
const HIDE_DELAY_MS = 200;
const EXCERPT_CHARS = 280;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/**
 * A card over a research link in the text (F-125): what the link points at, and
 * a way to open it without Mod+click. One card at a time, on `document.body` so
 * the editor's scroller does not clip it.
 */
export function attachResearchPreview(root: HTMLElement): void {
	let card: HTMLElement | null = null;
	let release: (() => void) | null = null;
	let showTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	// Bumped on every show and hide, so a card still loading when the pointer
	// has moved on is dropped instead of appearing late
	let generation = 0;

	const researchLink = (target: EventTarget | null) => {
		const anchor = (target as Element | null)?.closest?.("a");
		const id = anchor && researchIdFromHref(anchor.getAttribute("href") ?? "");
		return anchor && id ? { anchor, id } : null;
	};

	function hide() {
		generation++;
		clearTimeout(showTimer);
		card?.remove();
		card = null;
		release?.();
		release = null;
	}

	const hideSoon = () => {
		clearTimeout(showTimer);
		clearTimeout(hideTimer);
		hideTimer = setTimeout(hide, HIDE_DELAY_MS);
	};

	root.addEventListener("mouseover", (event) => {
		const link = researchLink(event.target);
		if (!link) return;
		clearTimeout(hideTimer);
		clearTimeout(showTimer);
		showTimer = setTimeout(async () => {
			hide();
			const mine = generation;
			const built = await buildResearchCard(link.id);
			if (mine !== generation) return built.release();
			card = built.card;
			release = built.release;
			card.addEventListener("mouseenter", () => clearTimeout(hideTimer));
			card.addEventListener("mouseleave", hideSoon);
			// A button in the card replaces the document; the card goes with it
			card.addEventListener("click", (e) => {
				if ((e.target as Element).closest("button")) hide();
			});
			document.body.appendChild(card);
			place(card, link.anchor.getBoundingClientRect());
		}, SHOW_DELAY_MS);
	});

	root.addEventListener("mouseout", (event) => {
		if (researchLink(event.target)) hideSoon();
	});
}

/** Below the link, or above it when there is no room underneath. */
function place(card: HTMLElement, anchor: DOMRect) {
	const gap = 6;
	const below = anchor.bottom + gap;
	const fitsBelow = below + card.offsetHeight <= window.innerHeight;
	card.style.top = `${fitsBelow ? below : Math.max(gap, anchor.top - card.offsetHeight - gap)}px`;
	card.style.left = `${Math.max(gap, Math.min(anchor.left, window.innerWidth - card.offsetWidth - gap))}px`;
}

/**
 * The card for one research id, built but not placed. `release` frees what the
 * card holds, which is the object URL of a thumbnail.
 */
export async function buildResearchCard(
	id: string,
): Promise<{ card: HTMLElement; release: () => void }> {
	const LL = getLL();
	const card = document.createElement("div");
	card.className = styles.card;
	card.setAttribute("role", "dialog");
	let release = () => {};

	if (store.get("research").length === 0) await loadResearch();
	const item = findResearchItem(id);
	const projectPath = store.get("projectPath");

	const title = document.createElement("div");
	title.className = styles.title;
	const detail = document.createElement("div");
	detail.className = styles.detail;
	card.append(title, detail);

	if (!item || !projectPath) {
		title.textContent = LL.notInResearch();
		detail.textContent = id;
		return { card, release };
	}

	title.textContent = item.title;
	if (item.kind === "link") detail.textContent = host(item.url);
	else detail.textContent = item.id.slice("research/".length);

	try {
		if (item.kind === "file" && IMAGE.test(item.id)) {
			const bytes = await readResearchImage(projectPath, item.id);
			const url = URL.createObjectURL(new Blob([bytes]));
			release = () => URL.revokeObjectURL(url);
			const img = document.createElement("img");
			img.className = styles.thumb;
			img.alt = item.title;
			img.src = url;
			card.appendChild(img);
		} else if (item.kind !== "file") {
			const excerpt = document.createElement("p");
			excerpt.className = styles.excerpt;
			excerpt.textContent = plainExcerpt(
				await readResearch(projectPath, item.id),
			);
			if (excerpt.textContent) card.appendChild(excerpt);
		}
	} catch (err) {
		// A preview that fails to load still leaves the card and its Open button
		console.error(err);
	}

	const actions = document.createElement("div");
	actions.className = styles.actions;
	const open = document.createElement("button");
	open.type = "button";
	open.className = "btn";
	open.textContent = LL.openResearch();
	open.addEventListener("click", () => {
		const active = store.get("activeDoc");
		const from = isResearch(active) ? store.get("researchReturn") : active;
		void openResearchById(item.id, from);
	});
	actions.appendChild(open);
	if (item.kind === "link") {
		const visit = document.createElement("button");
		visit.type = "button";
		visit.className = "btn";
		visit.textContent = LL.openLink();
		visit.addEventListener("click", () => {
			void openUrl(item.url).catch(console.error);
		});
		actions.appendChild(visit);
	}
	card.appendChild(actions);

	return { card, release };
}

/**
 * The first lines of a markdown body as plain text. Rendered and read back
 * through a parsed document that is never attached, so no markup reaches the
 * page and no script in the file runs.
 */
function plainExcerpt(markdown: string): string {
	const text =
		new DOMParser()
			.parseFromString(markdownToHtml(markdown), "text/html")
			.body.textContent?.replace(/\s+/g, " ")
			.trim() ?? "";
	return text.length > EXCERPT_CHARS
		? `${text.slice(0, EXCERPT_CHARS).trimEnd()}…`
		: text;
}
