/**
 * MCP Tool Definitions
 *
 * Defines the tools available to Claude for browser automation.
 * These definitions are sent to Claude via the MCP protocol.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js"

export const tools: Tool[] = [
  {
    name: "screenshot",
    description:
      "Capture a screenshot of the current page. Returns a base64-encoded JPEG image. " +
      "Call this first to see what's on the page, and after actions to verify they worked.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "click",
    description:
      "Click at specific x,y coordinates on the page. Use coordinates from the screenshot. " +
      "Click on input fields to focus them before typing.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate (horizontal position)" },
        y: { type: "number", description: "Y coordinate (vertical position)" },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "type",
    description:
      "Type text into the currently focused input field. " +
      "Make sure to click on the field first to focus it.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type" },
      },
      required: ["text"],
    },
  },
  {
    name: "press_key",
    description:
      "Press a special key. Use Tab to move between fields, Enter to submit/confirm, " +
      "Escape to close popups, Arrow keys to navigate, SelectAll (Ctrl+A) to select all text.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          enum: ["Tab", "Enter", "Escape", "Backspace", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space", "SelectAll"],
          description: "Key to press",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "scroll",
    description: "Scroll the page vertically. Use positive values to scroll down, negative to scroll up.",
    inputSchema: {
      type: "object",
      properties: {
        dy: {
          type: "number",
          description: "Pixels to scroll (positive = down, negative = up). Typical value: 300",
        },
      },
      required: ["dy"],
    },
  },
  {
    name: "get_form_fields",
    description:
      "Get a structured list of all form fields on the page, including their labels, types, " +
      "current values, and coordinates. Useful for understanding form structure.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_page_info",
    description:
      "Get the current page URL and title. Useful for verifying navigation " +
      "and understanding the current context.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_resume",
    description:
      "Generate a tailored resume PDF for the current job application. " +
      "Call this before upload_file when the form requires a resume upload.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_cover_letter",
    description:
      "Generate a tailored cover letter PDF for the current job application. " +
      "Call this before upload_file when the form requires a cover letter upload.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "upload_file",
    description:
      "Upload a generated document to the file input on the page. " +
      "You must call generate_resume or generate_cover_letter first.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["resume", "coverLetter"],
          description: "Which document to upload",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "done",
    description:
      "Signal that form filling is complete. Call this when all fields are filled. " +
      "DO NOT click any submit or apply buttons - the user will review and submit manually.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Brief summary of what was filled out",
        },
      },
      required: ["summary"],
    },
  },
]
