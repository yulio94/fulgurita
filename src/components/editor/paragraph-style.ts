import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		paragraphStyle: {
			/** Makes the block a paragraph and tags it with a semantic style. */
			setParagraphStyle: (styleName: string) => ReturnType;
			/** Back to a plain paragraph, style and node type both. */
			unsetParagraphStyle: () => ReturnType;
		};
	}
}

/**
 * Semantic styles for paragraphs — attribution, caption, verse, centered.
 *
 * ponytail: a global attribute on StarterKit's paragraph rather than a subclass
 * of @tiptap/extension-paragraph. Same rendered DOM and same commands, without
 * adding a dependency or a `paragraph: false` in the StarterKit config to keep
 * in sync.
 *
 * Only `data-style` is emitted. A `sietch-style--x` class would be redundant as
 * a styling hook, and being global it could not match a CSS Module selector.
 */
export const ParagraphStyle = Extension.create({
	name: "paragraphStyle",

	addGlobalAttributes() {
		return [
			{
				types: ["paragraph"],
				attributes: {
					styleName: {
						default: null,
						parseHTML: (element) => element.getAttribute("data-style"),
						// An unstyled paragraph has to render exactly as it did before
						// this extension existed, so null contributes no attribute.
						renderHTML: (attributes) =>
							attributes.styleName
								? { "data-style": attributes.styleName }
								: {},
					},
				},
			},
		];
	},

	addCommands() {
		return {
			// setParagraph first: picking Verse while the cursor sits in a heading
			// has to convert the block, not silently do nothing.
			setParagraphStyle:
				(styleName) =>
				({ chain }) =>
					chain()
						.setParagraph()
						.updateAttributes("paragraph", { styleName })
						.run(),

			unsetParagraphStyle:
				() =>
				({ chain }) =>
					chain()
						.setParagraph()
						.updateAttributes("paragraph", { styleName: null })
						.run(),
		};
	},
});
