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
      "Analyze the page DOM and return all form fields with their selectors, labels, types, " +
      "current values, and options (for dropdowns). Use this FIRST to understand the form structure, " +
      "then use fill_field/select_option to fill fields by selector.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "fill_field",
    description:
      "Fill a form field by CSS selector. More reliable than click+type. " +
      "Use the selector from get_form_fields. Works for text inputs, textareas, and similar fields.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for the field (from get_form_fields)" },
        value: { type: "string", description: "Value to fill in" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "select_option",
    description:
      "Select an option in a dropdown/select field by CSS selector. " +
      "Use the selector from get_form_fields and match against the options array.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for the select element" },
        value: { type: "string", description: "Option value to select (use 'value' from options, or 'text' if value is empty)" },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "set_checkbox",
    description:
      "Check or uncheck a checkbox/radio by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for the checkbox/radio" },
        checked: { type: "boolean", description: "true to check, false to uncheck" },
      },
      required: ["selector", "checked"],
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
    name: "get_user_profile",
    description:
      "Get the user's profile data including name, contact info, work experience, education, and skills. " +
      "Call this to get the information needed to fill form fields accurately.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_job_context",
    description:
      "Get details about the job being applied to, including title, company, location, and description. " +
      "Use this to tailor responses and understand what the application is for.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
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
