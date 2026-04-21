/**
 * Async Generator Example
 *
 * Demonstrates how to use async generators for streaming data,
 * similar to how an AI agent streams responses token by token.
 */

// Simple delay helper
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * StreamingChat - A simple class demonstrating async generators
 */
export class StreamingChat {
  private history: string[] = [];

  /**
   * Stream a response word by word using an async generator
   */
  async *stream(input: string): AsyncGenerator<string, void, unknown> {
    this.history.push(`User: ${input}`);

    const response = `Hello! You said: "${input}". This response is streamed word by word.`;
    const words = response.split(" ");

    for (const word of words) {
      await delay(100); // Simulate network latency
      yield word + " ";
    }

    this.history.push(`Assistant: ${response}`);
  }

  /**
   * Stream numbers with a transformation
   */
  async *countTo(n: number): AsyncGenerator<number, string, unknown> {
    for (let i = 1; i <= n; i++) {
      await delay(50);
      yield i;
    }
    return `Counted to ${n}`;
  }

  /**
   * Combine multiple async generators
   */
  async *multiStream(inputs: string[]): AsyncGenerator<string, void, unknown> {
    for (const input of inputs) {
      yield `\n--- Processing: ${input} ---\n`;
      yield* this.stream(input);
    }
  }

  getHistory(): string[] {
    return [...this.history];
  }
}

/**
 * DataFetcher - Demonstrates async generators for paginated data
 */
export class DataFetcher {
  private pageSize: number;

  constructor(pageSize = 3) {
    this.pageSize = pageSize;
  }

  /**
   * Fetch items page by page
   */
  async *fetchItems(total: number): AsyncGenerator<string[], void, unknown> {
    let fetched = 0;

    while (fetched < total) {
      await delay(200); // Simulate API call

      const remaining = total - fetched;
      const count = Math.min(this.pageSize, remaining);
      const items = Array.from(
        { length: count },
        (_, i) => `Item ${fetched + i + 1}`
      );

      fetched += count;
      yield items;
    }
  }

  /**
   * Fetch and flatten items one by one
   */
  async *fetchItemsFlat(total: number): AsyncGenerator<string, void, unknown> {
    for await (const batch of this.fetchItems(total)) {
      for (const item of batch) {
        yield item;
      }
    }
  }
}

/**
 * TaskRunner - Demonstrates async generators for task processing
 */
export class TaskRunner {
  /**
   * Process tasks and yield progress updates
   */
  async *processTasks(
    tasks: string[]
  ): AsyncGenerator<{ task: string; status: string; progress: number }, void, unknown> {
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      yield { task, status: "starting", progress: (i / tasks.length) * 100 };

      await delay(150); // Simulate work

      yield { task, status: "completed", progress: ((i + 1) / tasks.length) * 100 };
    }
  }
}

// ============================================================================
// Example Usage
// ============================================================================

async function main() {
  console.log("=== Async Generator Examples ===\n");

  // Example 1: Streaming Chat
  console.log("1. Streaming Chat:");
  const chat = new StreamingChat();

  process.stdout.write("   ");
  for await (const word of chat.stream("Hello world")) {
    process.stdout.write(word);
  }
  console.log("\n");

  // Example 2: Count with return value
  console.log("2. Count to 5:");
  process.stdout.write("   ");
  const counter = chat.countTo(5);
  let result = await counter.next();

  while (!result.done) {
    process.stdout.write(`${result.value} `);
    result = await counter.next();
  }
  console.log(`\n   Return value: ${result.value}\n`);

  // Example 3: Multi-stream
  console.log("3. Multi-stream:");
  for await (const chunk of chat.multiStream(["Hi", "Bye"])) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Example 4: Paginated data fetching
  console.log("4. Paginated Data Fetching:");
  const fetcher = new DataFetcher(3);

  console.log("   Fetching in batches:");
  let batch = 1;
  for await (const items of fetcher.fetchItems(7)) {
    console.log(`   Batch ${batch++}: [${items.join(", ")}]`);
  }
  console.log();

  // Example 5: Flattened items
  console.log("5. Flattened Items:");
  process.stdout.write("   ");
  for await (const item of fetcher.fetchItemsFlat(5)) {
    process.stdout.write(`${item}, `);
  }
  console.log("\n");

  // Example 6: Task processing with progress
  console.log("6. Task Processing:");
  const runner = new TaskRunner();
  const tasks = ["Build", "Test", "Deploy"];

  for await (const update of runner.processTasks(tasks)) {
    console.log(
      `   [${update.progress.toFixed(0)}%] ${update.task}: ${update.status}`
    );
  }
  console.log();

  // Example 7: Chat history
  console.log("7. Chat History:");
  chat.getHistory().forEach((msg) => console.log(`   ${msg}`));
}

main().catch(console.error);
