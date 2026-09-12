import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
	it("follows the system only when asked to", () => {
		expect(resolveTheme("system", true)).toBe("dark");
		expect(resolveTheme("system", false)).toBe("light");
	});

	// The point of the two values: an explicit pick outlives the OS flipping
	// under it, which is what makes the titlebar button's click stick.
	it("ignores the system for an explicit pick", () => {
		expect(resolveTheme("light", true)).toBe("light");
		expect(resolveTheme("light", false)).toBe("light");
		expect(resolveTheme("dark", true)).toBe("dark");
		expect(resolveTheme("dark", false)).toBe("dark");
	});
});
