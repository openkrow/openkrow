/**
 * ShowWidgetTool — Render visual content via SVG in the frontend.
 *
 * The agent generates SVG code and this tool passes it through
 * for the frontend to render as a widget in the chat interface.
 */

import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "show-widget.txt");

const MAX_SVG_SIZE = 50 * 1024; // 50KB

export function createShowWidgetTool(): Tool {
  return createTool({
    name: "show_widget",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        svg: {
          type: "string",
          description: "Valid SVG markup to render",
        },
        title: {
          type: "string",
          description: "Optional title/caption for the widget",
        },
      },
      required: ["svg"],
    },
    execute: async (args) => {
      const svg = args.svg as string;
      const title = args.title as string | undefined;

      if (!svg) return fail("svg is required");
      if (svg.length > MAX_SVG_SIZE) {
        return fail(`SVG too large (${(svg.length / 1024).toFixed(1)}KB). Maximum is 50KB.`);
      }

      // Basic validation: must contain an <svg element
      if (!svg.includes("<svg")) {
        return fail("Invalid SVG: must contain an <svg> element");
      }

      // Reject SVG with script tags or event handlers for security
      if (/<script/i.test(svg) || /on\w+\s*=/i.test(svg)) {
        return fail("SVG must not contain scripts or event handlers");
      }

      const output = title
        ? `<widget type="svg" title="${title}">\n${svg}\n</widget>`
        : `<widget type="svg">\n${svg}\n</widget>`;

      return ok(output);
    },
  });
}
