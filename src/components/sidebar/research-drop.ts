import { store } from "../../core/store";
import { importResearch } from "../../services/invoke";
import { loadResearch } from "../../services/research";

/**
 * The research folder a drop lands in: the folder row under the pointer, the
 * folder holding the file row under it, or null for the top of `research/`.
 * Folder rows carry their id and a file row carries its own, whose parent is
 * the path before the last `/`.
 */
export function dropFolder(target: Element | null): string | null {
	const row = target?.closest<HTMLElement>("[data-id]");
	const id = row?.dataset.id;
	if (!id?.startsWith("research/")) return null;
	if (row?.dataset.type === "folder") return id;
	const parent = id.slice(0, id.lastIndexOf("/"));
	return parent === "research" ? null : parent;
}

/**
 * Copies files dropped from Finder or Explorer into `research/` while the
 * research view is up. Tauri takes the drop at the window, so the webview never
 * sees HTML5 drag events for it: the position arrives in physical pixels.
 */
export async function watchResearchDrops(
	list: HTMLElement,
	active: () => boolean,
	onError: (message: string) => void,
	highlightClass: string,
): Promise<void> {
	let lit: Element | null = null;
	const light = (row: Element | null) => {
		lit?.classList.remove(highlightClass);
		lit = row;
		lit?.classList.add(highlightClass);
	};

	const under = (position: {
		toLogical(scale: number): { x: number; y: number };
	}) => {
		const { x, y } = position.toLogical(window.devicePixelRatio);
		const target = document.elementFromPoint(x, y);
		return target && list.contains(target) ? target : null;
	};

	// Loaded here rather than at the top: the app already loads the window and
	// event modules lazily, and a static import would pull them into the entry
	const { getCurrentWebview } = await import("@tauri-apps/api/webview");
	await getCurrentWebview().onDragDropEvent(async ({ payload }) => {
		if (payload.type === "leave" || !active()) return light(null);

		if (payload.type === "enter" || payload.type === "over") {
			const target = under(payload.position);
			const folder = target ? dropFolder(target) : null;
			light(
				folder ? list.querySelector(`[data-id="${CSS.escape(folder)}"]`) : null,
			);
			return;
		}

		light(null);
		const target = under(payload.position);
		const projectPath = store.get("projectPath");
		if (!target || !projectPath) return;
		try {
			await importResearch(projectPath, dropFolder(target), payload.paths);
		} catch (err) {
			onError(String(err));
		}
		await loadResearch();
	});
}
