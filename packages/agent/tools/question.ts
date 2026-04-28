/**
 * QuestionTool — Ask the user one or more questions.
 *
 * The LLM uses this tool to gather information, clarify requirements,
 * or get decisions from the user. The actual user interaction is handled
 * by a callback provided at tool creation time.
 */

import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "question.txt");

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionPrompt {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
}

/**
 * Callback that presents questions to the user and returns their answers.
 * Each answer is an array of selected option labels (or custom text).
 */
export type QuestionHandler = (questions: QuestionPrompt[]) => Promise<string[][]>;

export function createQuestionTool(handler: QuestionHandler): Tool {
  return createTool({
    name: "question",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "Questions to ask",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "Complete question" },
              header: { type: "string", description: "Very short label (max 30 chars)" },
              options: {
                type: "array",
                description: "Available choices",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Display text (1-5 words, concise)" },
                    description: { type: "string", description: "Explanation of choice" },
                  },
                  required: ["label", "description"],
                },
              },
              multiple: {
                type: "boolean",
                description: "Allow selecting multiple choices",
              },
            },
            required: ["question", "header", "options"],
          },
        },
      },
      required: ["questions"],
    },
    execute: async (args) => {
      const questions = args.questions as QuestionPrompt[];
      if (!Array.isArray(questions) || questions.length === 0) {
        return fail("At least one question is required");
      }

      try {
        const answers = await handler(questions);

        const formatted = questions
          .map(
            (q, i) =>
              `"${q.question}"="${answers[i]?.length ? answers[i].join(", ") : "Unanswered"}"`,
          )
          .join(", ");

        return ok(
          `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
        );
      } catch (err: unknown) {
        return fail(`Failed to get user answers: ${(err as Error).message}`);
      }
    },
  });
}
