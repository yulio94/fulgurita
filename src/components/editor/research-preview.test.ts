import { beforeEach, expect, test, vi } from "vitest";
import { store } from "../../core/store";
import { initI18n } from "../../i18n";

const readResearch = vi.hoisted(() => vi.fn());
vi.mock("../../services/invoke", () => ({
	readResearch,
	readResearchImage: vi.fn(),
	listResearch: vi.fn(() => Promise.resolve([])),
	openResearchFile: vi.fn(),
	readChapter: vi.fn(),
	renameChapter: vi.fn(),
}));

const { buildResearchCard } = await import("./research-preview");

initI18n("en");

beforeEach(() => {
	store.set("projectPath", "/tmp/novel");
	store.set("research", [
		{
			type: "folder",
			id: "research/Links",
			title: "Links",
			children: [
				{
					type: "item",
					id: "research/Links/Atlas.md",
					kind: "link",
					title: "Atlas",
					url: "https://atlas.test/maps",
				},
			],
		},
	]);
});

const buttons = (card: HTMLElement) =>
	[...card.querySelectorAll("button")].map((b) => b.textContent);

test("a link's card names the site, shows the notes and offers both ways out", async () => {
	readResearch.mockResolvedValue("Old **harbour** charts.");

	const { card } = await buildResearchCard("research/Links/Atlas.md");

	expect(card.textContent).toContain("Atlas");
	expect(card.textContent).toContain("atlas.test");
	// Rendered and read back as text: the markdown asterisks are gone
	expect(card.textContent).toContain("Old harbour charts.");
	expect(buttons(card)).toEqual(["Open", "Open link"]);
});

test("a link to a file that is gone says so, and offers nothing to open", async () => {
	const { card } = await buildResearchCard("research/Places/gone.png");

	expect(card.textContent).toContain("Not in the research folder");
	expect(buttons(card)).toEqual([]);
});

test("a card still loading when its link leaves the page never shows", async () => {
	vi.useFakeTimers();
	const { attachResearchPreview } = await import("./research-preview");
	const root = document.createElement("div");
	const anchor = document.createElement("a");
	anchor.setAttribute("href", "../research/Links/Atlas.md");
	root.appendChild(anchor);
	document.body.appendChild(root);
	attachResearchPreview(root);
	// The notes are still on their way when the link goes
	let finish: (body: string) => void = () => {};
	readResearch.mockReturnValue(
		new Promise<string>((resolve) => {
			finish = resolve;
		}),
	);

	anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
	await vi.advanceTimersByTimeAsync(300);
	// What Mod+click does: the document, and the link with it, is replaced
	anchor.remove();
	finish("Old harbour charts.");
	await vi.runAllTimersAsync();

	expect(document.body.querySelector("[role=dialog]")).toBeNull();
	vi.useRealTimers();
	root.remove();
});
