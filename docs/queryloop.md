# OpenKrow Query Loop
This is the heart of OpenKrow, The loop using async generator to elegant pull-based unifies event streaming.

Key architectural Patterns: 
- Async Generator (async function*): Instead of callbacks or EventEmitters, the loop yields intermediate results (yield message), allowing the UI consumer to control the pace of the output and gracefully close the loop if the user cancels via Ctrl+C

- Observe Content, Not Meta-data: The variable needsFollowUp = true is derived strictly by looking for tool_use blocks directly within the streamed API chunks, explicitly ignoring the LLM's stop_reason metadata, which Anthropic engineers noted was unreliable

- Continue Site Pattern: The state object is replaced completely at the very end of the loop iteration. This atomic transition guarantees that state is never partially updated if a crash or error occurs mid-loop, preventing wasted API tokens

- Parallel Streaming Execution: In Phase 2 and 3, the StreamingToolExecutor parses and fires off concurrency-safe read-only tools while the LLM is still generating its text response, dramatically minimizing latency


> Key takeaway: Async generator as control flow. Derived flag instead of API signal. Escalating recover

## Why async generator?
The async generator pattern allows the query loop to yield intermediate results (like messages from the LLM or tool execution results) to the UI as they become available, rather than waiting for the entire process to complete. This provides a more responsive user experience, as the UI can update in real-time with the progress of the query. Additionally, it allows for better error handling and control flow, as the UI can decide to stop the loop if the user cancels the operation, preventing unnecessary API calls and resource usage.

Async generator also win because pull-based semantics.

```typescript
// Pseudo-code for the Query Loop
async function* query(params: QueryParams): AsyncGenerator<QueryResult> {
  const ui = yield* queyrLoop(params);
  return ui
}

async function* queyrLoop(params: QueryParams): AsyncGenerator<QueryResult> {
  let state = buildInitialState(params);
  while (true) {
    let needsFollowUp = false;
    let toolResults = [];
    let updatedToolUseContext = state.toolUseContext;

    // 1. Context Assembly
    const queryContext = await assembleContext(state);

    // 2. Steam API call
    try {
      for await (const message of deps.callModel(queryContext)) {
        if (message.type =="assistant") {
          const toolBlocks = message.message.content.filter(block => block.type === "tool_use");

          if (toolBlocks.length > 0) {
            // loop continue
            needsFollowUp = true;

            // Steam tool execution
            for (const toolBlock of toolBlocks) {
              steamingToolExecutor.addTool(block, message);
            }
          }
          
          // push event to UI
          yield message
        }
      }
    } catch (error) {
      handleAiError(error);
    }

    // 3. Tool Execution
    const toolUpdates = steamingToolExecutor.getUpdates();

    for await (const update of toolUpdates) {
      if (update.message) {
        yield update.message; // push tool execution result to UI
        toolResults.push(update.result);
      }

      // Apply context modifier
      if (update.newContext) {
        updatedToolUseContext = update.newContext
      }
    }

    // Append file change
    toolResults.push(...fetchAttachments())

    // 4. Stop or Continue ?
    if (!needsFollowUp) {
      const hookStatus = runStopHooks()
      if (hookStatus == "prevent") {
        // Inject hook errors into conversation and continue loop
        toolResults.push(hookStatus.error)
        needsFollowUp = true;
      } else {
        return {
          reason: "complete",
        }
      }
    }

    // Max turn checks (prevents Death Spirals)
    if (state.turnCount > parms.maxTurns) {
      return {
        reason: "max_turns_exceeded",
      }
    }

    state = {
      messages: [...state.messages, ...state.assistantMessages, ...toolResults],
      toolUseContext: updatedToolUseContext,
      turnCount: state.turnCount + 1,
      transition: { reason: 'next_turn' } 
    }
  }
}
```

- **State Object** is the center of the loop, each interaction read the state in the beginning of the loop and update the state at the end of the loop.

- **transition.reason** track every state transition reason. This build the state machine inside of the loop.

## Context Assembly
Context Assembly is the first phase of the query loop, execute immediately before sending an API call to LLM. Its primary purpose is to clean up and compress the conversation history to prevent the LLM's context window from overflowing, minimizing both cost and information loss.

To archive this, we apply up to 5 compaction mechanisms in the following order:
1. **Tool result Budget**: This initial step caps oversized tool results, trimming massive outputs (such as thousands of lines from file reads or search results) so they fit within a predefined budget
2. **Snip Compact**: The cheapest but most aggressive method. It drops older message blocks entirely without relying on LLM summarization. It tracks the exact number of tokens removed (snipTokensFreed) and passes this data forward so the later stages accurately understand the remaining token budget
3. **Micocompact**: This layer selectively clears or summarizes individual stale tool outputs (e.g., removing the contents of a file read 10 turns ago). Crucially, it relies on cache edit block pinning to avoid breaking the prompt cache. It defers the deletion of tool results that fall within the cached prefix range, ensuring that clearing old results doesn't accidentally force the API to recompute tens of thousands of cached tokens
4. **Context Collapse**: This uses a staged reduction mechanism based on a read-time projection. It scans the conversation to find blocks that can be collapsed (such as 5 consecutive file reads) and creates a summarized, collapsed view of them right when sending the prompt. The original messages are never actually modified in the memory state, which again preserves the prompt cache
5. **Auto-Compaction**: The most expensive mechanism, used only as a last resort if the context collapse didn't reduce the prompt enough. If the token count exceeds the effectiveContextWindow (which reserves a 20,000-token buffer for the summary's output), it sends the entire conversation history to Agent and asks it to generate a summary. All older messages are then replaced by this single summary boundary message

```typescript
function assembleContext(state, model) {
  // 1. Tool Result Budget (Free, High info loss)
  // Trims massive outputs (e.g., thousands of lines from file reads) to fit a predefined budget.
  applyToolResultBudget(state.messages) [1];

  // 2. Snip Compact (Free, High info loss)
  // Drops older messages entirely without LLM summarization.
  // Tracks tokens freed so Auto-Compact knows the true remaining budget.
  let snipTokensFreed = 0 [2];
  if (config.HISTORY_SNIP) {
     snipTokensFreed = executeSnipCompact(state.messages) [2, 3];
  }

  // 3. Microcompact (Free, Medium info loss)
  // Selectively clears individual stale tool outputs. 
  // Uses 'cache edit block pinning' to preserve messages inside the prompt cache prefix.
  executeMicrocompact(state.messages, state.cachedPrefixRange) [4-6];

  // 4. Context Collapse (Low cost, Medium info loss)
  // Creates a summarized 'read-time projection' of repetitive blocks (e.g., 5 consecutive file reads).
  // Original messages are never modified to preserve the prompt cache.
  let projectedView = applyContextCollapse(state.messages) [7, 8];

  // 5. Auto-Compact (High cost, Low info loss)
  // The last resort: triggered only if Context Collapse didn't reduce the prompt enough.
  let currentTokens = tokenCountWithEstimation(projectedView) [3];
  let effectiveContextWindow = getContextWindowForModel(model) - 20000; // Reserves 20K tokens for summary [9]
  
  if (currentTokens > effectiveContextWindow) {
      // Sends the entire history to agent for summarization.
      // Replaces old messages with a single summary boundary message.
      projectedView = executeAutoCompact(projectedView, snipTokensFreed) [10, 11];
  }

  // 6. Final Budget Check
  // If the prompt is still too large and auto-compact is disabled, block the API call.
  if (tokenCountWithEstimation(projectedView) > hardLimit) {
      promptUserForManualCompaction() [10];
  }

  return { queryContext: projectedView, budget: calculateFinalBudget() };
}

```

## Tool Execution
Tool execution will add attachments to the system: file change notifications, memory prefetch results, skill discovery results, queued commands. All of those are injected into the conversation for the next call to LLM.

## Stop or Continue?
The "Stop or Continue" phrase is the final stage in each iteration of the query loop, functioning as the center decision-making point that determines whether the agent should keep execution tools or terminate the loop

The phase evaluates seven distinct exit paths and recovery strategies: 
1. **Normal Continuation**: if the `needsFollowUp` is true, meaning agent has requested to use tools, the system packages the conversation history, the new assistant message, and the tool results into a new state object and continues to the next iteration of the loop
2. **Normal Completion**: if `needsFollowUp` is false and no errors have occurred, the system checks user-defined stop hooks, if the hooks pass, the loop exits successfully with a `complete` status. If a hook fails, the hook's  error message is injected into the conversation and agent is forced to continue to fix the issue
3. **Prompt too long recovery (413 error)**: if the API rejects the request because the context window is full, the system attempts an escalating recovery cascade, trying the cheapest solutions first. It initially tries a "context collapse drain". If that is insufficient, it escalates to a "reactive compact" (calling the LLM to summarize the entire conversation). If both attempts fail, the loop terminates and surfaces the error to the user
4. **Max output token recovery**: If the model's response is cut off because it hit the output token limit, the system will first attempt to escalate the token budget (e.g., from 8K to 64K). If it continues to hit the limit, the system uses specific prompt engineering to save tokens, injecting the exact message: "Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.". It will retry this recovery up to three times before giving up
5. **Death Spiral Prevention on API Errors**: If a hard API error occurs (such as an authentication or rate limit error), the system immediately exits. Crucially, it deliberately skips running any stop hooks. This prevents a "death spiral" where an API error triggers a stop hook, which then injects an error message into the context, making the prompt even longer and guaranteeing another API error on the next turn
6. **Diminishing Returns Detection**: To prevent the agent from entering an infinite loop of trying to fix something while making no real progress, the system tracks token generation. If Agent continues for three consecutive turns but produces fewer than 500 tokens each time, the system detects this as pointless wheel-spinning and automatically blocks further execution to save your budget
7. **Max Turns Safety Net**: The system checks a hard maxTurns parameter. If the agent exceeds the allowed number of iterations for a single session, the loop is forcibly terminated with a max_turns reason to act as a final safeguard against runaway tasks
