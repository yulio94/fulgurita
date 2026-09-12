import { beforeEach, describe, expect, it } from "vitest";
import { bus } from "../../core/bus";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";
import { createTitlebar } from "./titlebar";

function mount() {
	const container = document.createElement("div");
	document.body.appendChild(container);
	createTitlebar(container);
	const [focusBtn, themeBtn] = Array.from(container.querySelectorAll("button"));
	return { container, focusBtn, themeBtn };
}

describe("titlebar", () => {
	beforeEach(() => {
		initI18n("en");
		document.body.replaceChildren();
		store.set("focusMode", false);
		store.set("resolvedTheme", "light");
	});

	it("emits focus:toggle and theme:toggle", () => {
		const seen: string[] = [];
		const offFocus = bus.on("focus:toggle", () => seen.push("focus"));
		const offTheme = bus.on("theme:toggle", () => seen.push("theme"));

		const { focusBtn, themeBtn } = mount();
		focusBtn.click();
		themeBtn.click();

		expect(seen).toEqual(["focus", "theme"]);
		offFocus();
		offTheme();
	});

	// Sun and moon read the same way round: the button shows where the click
	// lands, not where you are. The icon is the whole affordance for a sighted
	// user, so aria-label has to carry the same meaning for everyone else.
	it("names the theme it will show, not the one it is on", () => {
		const { themeBtn } = mount();
		expect(themeBtn.getAttribute("aria-label")).toBe("Dark");

		store.set("resolvedTheme", "dark");
		expect(themeBtn.getAttribute("aria-label")).toBe("Light");
	});

	// Swapped, not appended: the moon must not still be there under the sun.
	it("draws one icon in each button, and hides it from the name", () => {
		const { focusBtn, themeBtn } = mount();
		expect(focusBtn.querySelectorAll("svg")).toHaveLength(1);
		expect(themeBtn.querySelectorAll("svg")).toHaveLength(1);

		store.set("resolvedTheme", "dark");
		expect(themeBtn.querySelectorAll("svg")).toHaveLength(1);
		expect(themeBtn.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
			"true",
		);
	});

	// The icon says nothing on its own, so the button is only usable with a name.
	it("gives the focus button a name and a tooltip", () => {
		const { focusBtn } = mount();
		expect(focusBtn.getAttribute("aria-label")).toBe("Focus Mode");
		expect(focusBtn.title).toBe("Toggle Focus Mode");
	});

	it("marks focus mode as pressed while it is on", () => {
		const { focusBtn } = mount();
		expect(focusBtn.getAttribute("aria-pressed")).toBe("false");

		store.set("focusMode", true);
		expect(focusBtn.getAttribute("aria-pressed")).toBe("true");
	});
});
