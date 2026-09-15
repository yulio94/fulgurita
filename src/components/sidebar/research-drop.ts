import { store } from "../../core/store";
import { importResearch } from "../../services/invoke";
import { isWindows } from "../../services/platform";
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
 * A drop position in CSS pixels. Tauri types it `PhysicalPosition` on every
 * platform, but wry fills it in three ways: Windows converts the screen point
 * to client pixels, which are physical; macOS hands over NSView points and
 * WebKitGTK widget coordinates, which are both CSS pixels already. Dividing
 * those by the pixel ratio a second time lands the drop on the wrong row.
 */
export function cssPoint(
	position: { x: number; y: number },
	windows: boolean,
	ratio: number,
): { x: number; y: number } {
	const scale = windows ? ratio : 1;
	return { x: position.x / scale, y: position.y / scale };
}

/**
 * Copies files dropped from Finder or Explorer into `research/` while the
 * research view is up. Tauri takes the drop at the window, so the webview never
 * sees HTML5 drag events for it and the sidebar hit-tests the position itself.
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

	const under = (position: { x: number; y: number }) => {
		const { x, y } = cssPoint(position, isWindows, window.devicePixelRatio);
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
