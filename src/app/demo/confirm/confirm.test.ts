import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Ensure the leaf-shape → paw-shape CSS class rename is complete
 * across all files that render background SVG decorations.
 */

const FILES_WITH_BACKGROUND_SHAPES = [
  "src/app/demo/confirm/page.tsx",
  "src/app/onboarding/page.tsx",
  "src/components/onboarding/onboarding-layout.tsx",
  "src/app/demo/page.tsx",
  "src/app/page.tsx",
];

describe("paw-shape CSS class consistency", () => {
  it("no file uses the old leaf-shape class", () => {
    for (const filePath of FILES_WITH_BACKGROUND_SHAPES) {
      const content = readFileSync(join(process.cwd(), filePath), "utf-8");
      expect(content, `${filePath} still uses leaf-shape`).not.toContain("leaf-shape");
    }
  });

  it("all background SVG files use paw-shape class", () => {
    for (const filePath of FILES_WITH_BACKGROUND_SHAPES) {
      const content = readFileSync(join(process.cwd(), filePath), "utf-8");
      expect(content, `${filePath} missing paw-shape`).toContain("paw-shape");
    }
  });
});
