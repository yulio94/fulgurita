import { expect, test } from "vitest";
import { store } from "../core/store";
import { initSplitPanels } from "./split-panels";

function layout(): HTMLElement {
	const app = document.createElement("div");
	app.className = "app";
	for (let i = 0; i < 2; i++) {
		const divider = document.createElement("div");
		divider.className = "divider";
		app.appendChild(divider);
	}
	return app;
}

// The layout was only ever applied from the two toggle handlers, so a panel the
// writer had closed came back open on the next launch — and its gutter went
// unregistered, leaving it open and un-draggable.
test("the persisted panel state is applied on startup", () => {
	store.set("sidebarOpen", false);
	store.set("inspectorOpen", false);

	const app = layout();
	initSplitPanels(app, 268, 300);

	expect(app.classList.contains("both-closed")).toBe(true);
	expect(app.style.gridTemplateColumns).toBe("0px 0px 1fr 0px 0px");
});

test("the persisted widths are applied on startup", () => {
	store.set("sidebarOpen", true);
	store.set("inspectorOpen", false);

	const app = layout();
	initSplitPanels(app, 300, 260);

	expect(app.classList.contains("inspector-closed")).toBe(true);
	// 300px, not the stylesheet's --sidebar-w
	expect(app.style.gridTemplateColumns).toBe("300px 1px 1fr 0px 0px");
});

// Focus mode reads sidebarOpen/inspectorOpen rather than writing them, so the
// panels the writer had open are the panels that come back.
test("focus mode collapses both panels and gives them back on exit", () => {
	store.set("sidebarOpen", true);
	store.set("inspectorOpen", false);
	store.set("focusMode", false);

	const app = layout();
	initSplitPanels(app, 268, 300);
	expect(app.style.gridTemplateColumns).toBe("268px 1px 1fr 0px 0px");

	store.set("focusMode", true);
	expect(app.classList.contains("both-closed")).toBe(true);
	expect(app.style.gridTemplateColumns).toBe("0px 0px 1fr 0px 0px");

	store.set("focusMode", false);
	expect(app.style.gridTemplateColumns).toBe("268px 1px 1fr 0px 0px");
	expect(app.classList.contains("inspector-closed")).toBe(true);
});
