import type { Tool } from "@openkrow/agent";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { bashTool } from "./bash.js";
import { grepTool } from "./grep.js";
import { listFilesTool } from "./list-files.js";

/**
 * Create the default set of tools available to the coding agent.
 */
export function createDefaultTools(): Tool[] {
  return [readFileTool, writeFileTool, bashTool, grepTool, listFilesTool];
}
