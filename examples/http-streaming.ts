/**
 * HTTP Streaming Example
 *
 * Demonstrates streaming async generators over HTTP using:
 * 1. Server-Sent Events (SSE)
 * 2. ReadableStream (chunked transfer)
 * 3. NDJSON (newline-delimited JSON)
 *
 * Run: npx tsc && node dist/http-streaming.js
 * Then open http://localhost:3000 in a browser
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// Async Generators (data sources)
// ============================================================================

async function* streamWords(text: string): AsyncGenerator<string> {
  const words = text.split(" ");
  for (const word of words) {
    await delay(150);
    yield word;
  }
}

async function* streamEvents(): AsyncGenerator<{ type: string; data: unknown; time: number }> {
  const events = ["connected", "processing", "update", "update", "complete"];
  for (let i = 0; i < events.length; i++) {
    await delay(200);
    yield {
      type: events[i],
      data: { progress: ((i + 1) / events.length) * 100, message: `Step ${i + 1}` },
      time: Date.now(),
    };
  }
}

async function* streamNumbers(n: number): AsyncGenerator<number> {
  for (let i = 1; i <= n; i++) {
    await delay(100);
    yield i;
  }
}

// ============================================================================
// HTTP Handlers
// ============================================================================

/**
 * Server-Sent Events (SSE)
 * Best for: Real-time updates, AI chat streaming, notifications
 */
async function handleSSE(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const text = "Hello! This is a streaming response sent word by word using Server-Sent Events.";

  for await (const word of streamWords(text)) {
    // SSE format: "data: <content>\n\n"
    res.write(`data: ${word}\n\n`);
  }

  res.write(`data: [DONE]\n\n`);
  res.end();
}

/**
 * NDJSON Streaming
 * Best for: Structured data, API responses, logs
 */
async function handleNDJSON(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "Transfer-Encoding": "chunked",
    "Access-Control-Allow-Origin": "*",
  });

  for await (const event of streamEvents()) {
    res.write(JSON.stringify(event) + "\n");
  }

  res.end();
}

/**
 * Chunked Text Streaming
 * Best for: Large files, binary data, simple text
 */
async function handleChunked(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Cache-Control": "no-cache",
    "Transfer-Encoding": "chunked",
    "Access-Control-Allow-Origin": "*",
  });

  for await (const num of streamNumbers(10)) {
    res.write(`Count: ${num}\n`);
  }

  res.write("Done!\n");
  res.end();
}

/**
 * HTML Page with all examples
 */
function handleIndex(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>HTTP Streaming Examples</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #666; margin-top: 30px; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; font-size: 14px; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; min-height: 60px; }
    .output { white-space: pre-wrap; word-wrap: break-word; }
    .clear { background: #ff6b6b; color: white; border: none; border-radius: 4px; }
    .run { background: #4dabf7; color: white; border: none; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>HTTP Streaming Examples</h1>
  <p>Demonstrates streaming async generators over HTTP</p>

  <h2>1. Server-Sent Events (SSE)</h2>
  <p>Best for real-time updates, AI chat streaming, notifications</p>
  <button class="run" onclick="runSSE()">Run SSE Stream</button>
  <button class="clear" onclick="clearOutput('sse')">Clear</button>
  <pre id="sse" class="output"></pre>

  <h2>2. NDJSON Streaming</h2>
  <p>Best for structured data, API responses, logs</p>
  <button class="run" onclick="runNDJSON()">Run NDJSON Stream</button>
  <button class="clear" onclick="clearOutput('ndjson')">Clear</button>
  <pre id="ndjson" class="output"></pre>

  <h2>3. Chunked Transfer</h2>
  <p>Best for large files, binary data, simple text</p>
  <button class="run" onclick="runChunked()">Run Chunked Stream</button>
  <button class="clear" onclick="clearOutput('chunked')">Clear</button>
  <pre id="chunked" class="output"></pre>

  <script>
    function clearOutput(id) {
      document.getElementById(id).textContent = '';
    }

    // SSE using EventSource API
    function runSSE() {
      clearOutput('sse');
      const output = document.getElementById('sse');
      const eventSource = new EventSource('/sse');
      
      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          output.textContent += '\\n[Stream Complete]';
          eventSource.close();
        } else {
          output.textContent += event.data + ' ';
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
      };
    }

    // NDJSON using fetch + ReadableStream
    async function runNDJSON() {
      clearOutput('ndjson');
      const output = document.getElementById('ndjson');
      
      const response = await fetch('/ndjson');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          output.textContent += '\\n[Stream Complete]';
          break;
        }
        
        const text = decoder.decode(value);
        const lines = text.trim().split('\\n');
        
        for (const line of lines) {
          if (line) {
            const event = JSON.parse(line);
            output.textContent += JSON.stringify(event, null, 2) + '\\n';
          }
        }
      }
    }

    // Chunked transfer using fetch + ReadableStream
    async function runChunked() {
      clearOutput('chunked');
      const output = document.getElementById('chunked');
      
      const response = await fetch('/chunked');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          output.textContent += '[Stream Complete]';
          break;
        }
        output.textContent += decoder.decode(value);
      }
    }
  </script>
</body>
</html>
  `);
}

// ============================================================================
// Server
// ============================================================================

const server = createServer((req, res) => {
  const url = req.url || "/";

  switch (url) {
    case "/":
      handleIndex(req, res);
      break;
    case "/sse":
      handleSSE(req, res);
      break;
    case "/ndjson":
      handleNDJSON(req, res);
      break;
    case "/chunked":
      handleChunked(req, res);
      break;
    default:
      res.writeHead(404);
      res.end("Not Found");
  }
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           HTTP Streaming Examples Server                   ║
╠════════════════════════════════════════════════════════════╣
║  Open in browser:  http://localhost:${PORT}                   ║
║                                                            ║
║  Endpoints:                                                ║
║    GET /        - Interactive demo page                    ║
║    GET /sse     - Server-Sent Events stream                ║
║    GET /ndjson  - NDJSON stream                            ║
║    GET /chunked - Chunked transfer stream                  ║
║                                                            ║
║  Press Ctrl+C to stop                                      ║
╚════════════════════════════════════════════════════════════╝
  `);
});
