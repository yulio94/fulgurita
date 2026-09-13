import type { Editor } from "@tiptap/core";
import { getLL } from "../../i18n";
import { icon } from "../../services/icons";
import styles from "./style-dropdown.module.css";
import {
	PARAGRAPH_STYLES,
	type ParagraphStyleSpec,
	resolveActiveStyle,
} from "./styles-catalog";

/**
 * Semantic paragraph style picker.
 *
 * ponytail: takes the editor for the same reason the format row does — the
 * Editor is local to createEditor, and routing these commands through the bus
 * would buy nothing.
 */
export function createStyleDropdown(container: HTMLElement, editor: Editor) {
	const LL = getLL();

	const wrap = document.createElement("div");
	wrap.className = styles.wrap;

	const trigger = document.createElement("button");
	trigger.type = "button";
	trigger.className = styles.trigger;
	trigger.setAttribute("aria-label", LL.styleDropdownLabel());
	trigger.setAttribute("aria-haspopup", "true");
	trigger.setAttribute("aria-expanded", "false");

	const triggerLabel = document.createElement("span");
	const caret = icon("chevronDown", true);
	caret.classList.add(styles.caret);
	trigger.append(triggerLabel, caret);

	const menu = document.createElement("div");
	menu.className = styles.menu;
	menu.setAttribute("role", "menu");
	menu.setAttribute("aria-label", LL.styleDropdownLabel());
	menu.hidden = true;

	// The two mechanisms behind the catalog are worth seeing apart: everything in
	// the first group is a markdown construct, everything in the second is ours.
	const groups: [string, ParagraphStyleSpec[]][] = [
		[
			LL.styleGroupStructure(),
			PARAGRAPH_STYLES.filter((s) => s.kind === "node"),
		],
		[
			LL.styleGroupSemantic(),
			PARAGRAPH_STYLES.filter((s) => s.kind === "style"),
		],
	];

	const items: { spec: ParagraphStyleSpec; el: HTMLButtonElement }[] = [];

	for (const [heading, specs] of groups) {
		const group = document.createElement("div");
		group.className = styles.group;
		group.setAttribute("role", "group");
		group.setAttribute("aria-label", heading);

		const caption = document.createElement("div");
		// section-label is global (theme.css), so it is not hashed
		caption.className = `section-label ${styles.groupLabel}`;
		caption.textContent = heading;
		group.appendChild(caption);

		for (const spec of specs) {
			const el = document.createElement("button");
			el.type = "button";
			el.className = styles.item;
			el.setAttribute("role", "menuitemradio");
			el.setAttribute("aria-checked", "false");
			// Roving tabindex: the menu is one tab stop, arrows move inside it
			el.tabIndex = -1;

			const check = icon("check", true);
			check.classList.add(styles.check);
			const label = document.createElement("span");
			label.textContent = spec.label(LL);
			el.append(check, label);

			el.addEventListener("click", () => {
				spec.run(editor);
				close();
			});

			group.appendChild(el);
			items.push({ spec, el });
		}
		menu.appendChild(group);
	}

	wrap.append(trigger, menu);
	// Leads the row: it names what the block is, the buttons after it decorate
	// what is inside the block.
	container.prepend(wrap);

	// --- open/close ---------------------------------------------------------

	// Registered only while the menu is open, so a closed dropdown costs nothing.
	function onPointerDown(event: PointerEvent) {
		if (!wrap.contains(event.target as Node)) close();
	}

	function open() {
		if (!menu.hidden) return;
		menu.hidden = false;
		trigger.setAttribute("aria-expanded", "true");
		document.addEventListener("pointerdown", onPointerDown);
		// Land on the current style, so Enter alone is a no-op rather than a surprise
		focusItem(
			items.findIndex((i) => i.el.getAttribute("aria-checked") === "true"),
		);
	}

	function close(returnFocus = true) {
		if (menu.hidden) return;
		menu.hidden = true;
		trigger.setAttribute("aria-expanded", "false");
		document.removeEventListener("pointerdown", onPointerDown);
		if (returnFocus) trigger.focus();
	}

	function focusItem(index: number) {
		const target = items[Math.max(0, index)] ?? items[0];
		for (const { el } of items) el.tabIndex = -1;
		target.el.tabIndex = 0;
		target.el.focus();
	}

	trigger.addEventListener("click", () => {
		menu.hidden ? open() : close();
	});

	menu.addEventListener("keydown", (event) => {
		const current = items.findIndex((i) => i.el === document.activeElement);

		switch (event.key) {
			case "ArrowDown":
				focusItem((current + 1) % items.length);
				break;
			case "ArrowUp":
				focusItem((current - 1 + items.length) % items.length);
				break;
			case "Home":
				focusItem(0);
				break;
			case "End":
				focusItem(items.length - 1);
				break;
			case "Escape":
				close();
				break;
			case "Enter":
			case " ":
				// The click listener owns activation; this only keeps the page from
				// scrolling on Space.
				items[current]?.el.click();
				break;
			default:
				return;
		}
		event.preventDefault();
	});

	trigger.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown" || event.key === "Enter") {
			open();
			event.preventDefault();
		}
	});

	// --- state --------------------------------------------------------------

	function sync() {
		const active = resolveActiveStyle(editor);
		triggerLabel.textContent = active.label(LL);
		for (const { spec, el } of items) {
			const on = spec.id === active.id;
			el.setAttribute("aria-checked", String(on));
			el.classList.toggle(styles.itemActive, on);
		}
	}

	// onUpdate misses selection changes, and moving the cursor into a verse has to
	// relabel the trigger.
	editor.on("transaction", sync);
	sync();
}
