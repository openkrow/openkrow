import { useState, useEffect } from "react";
import { rpc } from "./rpc";
import type { ProviderInfo, McpServerInfo, ProviderAuthPrompt } from "../shared/types";

type Tab = "providers" | "mcp";

export default function App() {
  const [tab, setTab] = useState<Tab>("providers");

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-200 font-sans">
      {/* Draggable title bar area */}
      <div className="shrink-0" style={{ height: "1.75rem", WebkitAppRegion: "drag" } as any} />

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 px-5 shrink-0">
        <button
          onClick={() => setTab("providers")}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            tab === "providers"
              ? "border-white text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Providers
        </button>
        <button
          onClick={() => setTab("mcp")}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            tab === "mcp"
              ? "border-white text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          MCP Servers
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "providers" ? <ProvidersTab /> : <McpTab />}
      </div>
    </div>
  );
}

// ── Providers Tab ──

function ProvidersTab() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await rpc.request.listProviderConnections({});
    if ("providers" in res) {
      setProviders(res.providers);
      setConnected(res.connected);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDisconnect = async (providerID: string) => {
    // Optimistic update
    setProviders((prev) => prev.map((p) => p.id === providerID ? { ...p, connected: false } : p));
    setConnected((prev) => prev.filter((id) => id !== providerID));
    await rpc.request.removeProviderAuth({ providerID });
  };

  const handleDone = async (providerID: string) => {
    // Optimistic update
    setEditingProvider(null);
    setProviders((prev) => prev.map((p) => p.id === providerID ? { ...p, connected: true } : p));
    setConnected((prev) => prev.includes(providerID) ? prev : [...prev, providerID]);
  };

  if (loading) {
    return <div className="text-xs text-neutral-500 text-center py-8">Loading providers...</div>;
  }

  const filtered = providers
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.connected === b.connected ? 0 : a.connected ? -1 : 1));

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search providers..."
        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-600"
      />
      {filtered.map((provider) => (
        <div key={provider.id} className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{provider.name}</span>
              <span className="text-[10px] text-neutral-500 font-mono">{provider.id}</span>
            </div>
            <div className="flex items-center gap-2">
              {provider.connected ? (
                <>
                  <span className="text-[10px] text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    Connected
                  </span>
                  <button
                    onClick={() => handleDisconnect(provider.id)}
                    className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditingProvider(editingProvider === provider.id ? null : provider.id)}
                  className="text-[10px] px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300 transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {provider.models.length > 0 && (
            <div className="mt-1 text-[10px] text-neutral-500">
              {provider.models.length} model{provider.models.length !== 1 ? "s" : ""}
            </div>
          )}

          {editingProvider === provider.id && (
            <ProviderAuthForm
              provider={provider}
              onDone={() => handleDone(provider.id)}
              onCancel={() => setEditingProvider(null)}
            />
          )}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-xs text-neutral-500 text-center py-8">
          {search ? "No providers match your search" : "No providers available"}
        </div>
      )}
    </div>
  );
}

// ── Provider Auth Form ──

function ProviderAuthForm({ provider, onDone, onCancel }: {
  provider: ProviderInfo;
  onDone: () => void;
  onCancel: () => void;
}) {
  const methods = provider.authMethods;
  const [selectedMethod, setSelectedMethod] = useState(0);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [oauthStep, setOauthStep] = useState<null | { url: string; instructions: string }>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!methods || methods.length === 0) {
    return (
      <div className="mt-3 text-[10px] text-neutral-500">
        No auth methods available for this provider.
      </div>
    );
  }

  const method = methods[selectedMethod];

  const setInput = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const isPromptVisible = (prompt: ProviderAuthPrompt): boolean => {
    if (!prompt.when) return true;
    const { key, op, value } = prompt.when;
    const current = inputs[key] ?? "";
    return op === "eq" ? current === value : current !== value;
  };

  const visiblePrompts = (method.prompts ?? []).filter(isPromptVisible);
  const hasApiKeyPrompt = method.type === "api" && visiblePrompts.some((p) => p.type === "text");

  const handleApiSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const prompts = method.prompts ?? [];
      const keyPrompt = prompts.find((p) => p.type === "text" && isPromptVisible(p));
      const key = keyPrompt ? (inputs[keyPrompt.key] ?? "").trim() : (inputs["__apiKey"] ?? "").trim();
      if (!key) { setSaving(false); return; }

      const metadata: Record<string, string> = {};
      for (const p of prompts) {
        if (p.type === "select" && isPromptVisible(p) && inputs[p.key]) {
          metadata[p.key] = inputs[p.key];
        }
      }

      await rpc.request.setProviderAuth({
        providerID: provider.id,
        auth: { type: "api", key, metadata: Object.keys(metadata).length > 0 ? metadata : undefined },
      });
      onDone();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
    setSaving(false);
  };

  const handleOAuthStart = async () => {
    setSaving(true);
    setError(null);
    try {
      const selectInputs: Record<string, string> = {};
      for (const p of method.prompts ?? []) {
        if (p.type === "select" && isPromptVisible(p) && inputs[p.key]) {
          selectInputs[p.key] = inputs[p.key];
        }
      }
      const res = await rpc.request.startProviderOAuth({
        providerID: provider.id,
        methodIndex: selectedMethod,
        inputs: Object.keys(selectInputs).length > 0 ? selectInputs : undefined,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        setOauthStep({ url: res.url, instructions: res.instructions });
        window.open(res.url, "_blank");
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
    setSaving(false);
  };

  const handleOAuthComplete = async () => {
    if (!oauthCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await rpc.request.completeProviderOAuth({
        providerID: provider.id,
        methodIndex: selectedMethod,
        code: oauthCode.trim(),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        onDone();
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
    setSaving(false);
  };

  return (
    <div className="mt-3 space-y-3">
      {methods.length > 1 && (
        <div className="flex gap-2">
          {methods.map((m, i) => (
            <button
              key={i}
              onClick={() => { setSelectedMethod(i); setOauthStep(null); setOauthCode(""); setError(null); setInputs({}); }}
              className={`px-2 py-1 text-[11px] rounded ${
                selectedMethod === i ? "bg-neutral-600 text-white" : "bg-neutral-700/50 text-neutral-400"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {visiblePrompts.map((prompt) => (
        <div key={prompt.key}>
          <label className="block text-[10px] text-neutral-400 mb-1">{prompt.message}</label>
          {prompt.type === "text" ? (
            <input
              type={prompt.key.toLowerCase().includes("key") || prompt.key.toLowerCase().includes("secret") || prompt.key.toLowerCase().includes("token") ? "password" : "text"}
              value={inputs[prompt.key] ?? ""}
              onChange={(e) => setInput(prompt.key, e.target.value)}
              placeholder={prompt.placeholder ?? ""}
              autoFocus
              className="w-full bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && method.type === "api") handleApiSubmit();
                if (e.key === "Escape") onCancel();
              }}
            />
          ) : (
            <select
              value={inputs[prompt.key] ?? ""}
              onChange={(e) => setInput(prompt.key, e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-xs text-neutral-200 outline-none focus:border-neutral-500"
            >
              <option value="">Select...</option>
              {(prompt.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{opt.hint ? ` — ${opt.hint}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}

      {/* Fallback API key input when no text prompts are defined */}
      {method.type === "api" && !hasApiKeyPrompt && (
        <div>
          <label className="block text-[10px] text-neutral-400 mb-1">API Key</label>
          <input
            type="password"
            value={inputs["__apiKey"] ?? ""}
            onChange={(e) => setInput("__apiKey", e.target.value)}
            placeholder="Enter API key..."
            autoFocus
            className="w-full bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApiSubmit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
      )}

      {method.type === "oauth" && oauthStep && (
        <div className="space-y-2">
          <p className="text-[10px] text-neutral-400">{oauthStep.instructions || "A browser window has opened. Paste the authorization code below."}</p>
          <input
            type="text"
            value={oauthCode}
            onChange={(e) => setOauthCode(e.target.value)}
            placeholder="Paste authorization code..."
            autoFocus
            className="w-full bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleOAuthComplete();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Cancel
        </button>
        {method.type === "api" && (
          <button
            onClick={handleApiSubmit}
            disabled={saving}
            className="px-3 py-1.5 bg-white text-neutral-900 rounded-md text-xs font-medium hover:bg-neutral-100 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {method.type === "oauth" && !oauthStep && (
          <button
            onClick={handleOAuthStart}
            disabled={saving}
            className="px-3 py-1.5 bg-white text-neutral-900 rounded-md text-xs font-medium hover:bg-neutral-100 transition-colors disabled:opacity-40"
          >
            {saving ? "Opening..." : "Authorize"}
          </button>
        )}
        {method.type === "oauth" && oauthStep && (
          <button
            onClick={handleOAuthComplete}
            disabled={saving || !oauthCode.trim()}
            className="px-3 py-1.5 bg-white text-neutral-900 rounded-md text-xs font-medium hover:bg-neutral-100 transition-colors disabled:opacity-40"
          >
            {saving ? "Verifying..." : "Submit Code"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── MCP Tab ──

function McpTab() {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<"local" | "remote">("local");
  const [addName, setAddName] = useState("");
  const [addCommand, setAddCommand] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await rpc.request.listMcpServers({});
    if ("servers" in res) {
      setServers(res.servers);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setSaving(true);
    if (addType === "local") {
      if (!addCommand.trim()) { setSaving(false); return; }
      await rpc.request.addMcpServer({
        name: addName.trim(),
        config: { type: "local", command: addCommand.trim().split(/\s+/) },
      });
    } else {
      if (!addUrl.trim()) { setSaving(false); return; }
      await rpc.request.addMcpServer({
        name: addName.trim(),
        config: { type: "remote", url: addUrl.trim() },
      });
    }
    setAddName("");
    setAddCommand("");
    setAddUrl("");
    setShowAdd(false);
    setSaving(false);
    load();
  };

  const handleRemove = async (name: string) => {
    await rpc.request.removeMcpServer({ name });
    load();
  };

  const handleReconnect = async (name: string) => {
    await rpc.request.reconnectMcpServer({ name });
    load();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "connected": return "text-green-400";
      case "disabled": return "text-neutral-500";
      case "failed": return "text-red-400";
      case "needs_auth": return "text-yellow-400";
      default: return "text-neutral-400";
    }
  };

  const statusDot = (status: string) => {
    switch (status) {
      case "connected": return "bg-green-400";
      case "disabled": return "bg-neutral-500";
      case "failed": return "bg-red-400";
      case "needs_auth": return "bg-yellow-400";
      default: return "bg-neutral-400";
    }
  };

  if (loading) {
    return <div className="text-xs text-neutral-500 text-center py-8">Loading MCP servers...</div>;
  }

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <div key={server.name} className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{server.name}</span>
              <span className={`text-[10px] flex items-center gap-1 ${statusColor(server.status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(server.status)}`} />
                {server.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {server.status === "failed" && (
                <button
                  onClick={() => handleReconnect(server.name)}
                  className="text-[10px] px-2 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300 transition-colors"
                >
                  Reconnect
                </button>
              )}
              <button
                onClick={() => handleRemove(server.name)}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
          {server.error && (
            <p className="mt-1 text-[10px] text-red-400">{server.error}</p>
          )}
          {server.config && (
            <p className="mt-1 text-[10px] text-neutral-500 font-mono">
              {server.config.type === "local"
                ? server.config.command.join(" ")
                : server.config.url}
            </p>
          )}
        </div>
      ))}

      {servers.length === 0 && !showAdd && (
        <div className="text-xs text-neutral-500 text-center py-4">No MCP servers configured</div>
      )}

      {showAdd ? (
        <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-4 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setAddType("local")}
              className={`px-2 py-1 text-[11px] rounded ${addType === "local" ? "bg-neutral-600 text-white" : "bg-neutral-700/50 text-neutral-400"}`}
            >
              Local
            </button>
            <button
              onClick={() => setAddType("remote")}
              className={`px-2 py-1 text-[11px] rounded ${addType === "remote" ? "bg-neutral-600 text-white" : "bg-neutral-700/50 text-neutral-400"}`}
            >
              Remote
            </button>
          </div>
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Server name"
            className="w-full bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
          />
          {addType === "local" ? (
            <input
              type="text"
              value={addCommand}
              onChange={(e) => setAddCommand(e.target.value)}
              placeholder="Command (e.g. npx -y @modelcontextprotocol/server-filesystem)"
              className="w-full bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
            />
          ) : (
            <input
              type="text"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="Server URL (e.g. https://mcp.example.com/sse)"
              className="w-full bg-neutral-900 border border-neutral-600 rounded-md px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
            />
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setAddName(""); setAddCommand(""); setAddUrl(""); }}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !addName.trim() || (addType === "local" ? !addCommand.trim() : !addUrl.trim())}
              className="px-3 py-1.5 bg-white text-neutral-900 rounded-md text-xs font-medium hover:bg-neutral-100 transition-colors disabled:opacity-40"
            >
              Add Server
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2 border border-dashed border-neutral-700 rounded-lg text-xs text-neutral-500 hover:text-neutral-300 hover:border-neutral-600 transition-colors"
        >
          + Add MCP Server
        </button>
      )}
    </div>
  );
}
