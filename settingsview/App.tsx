import { useState, useEffect } from "react";
import { rpc } from "./rpc";
import type { ProviderInfo, McpServerInfo, ProviderAuthPrompt } from "../shared/types";

type Tab = "providers" | "mcp";

export default function App() {
  const [tab, setTab] = useState<Tab>("providers");

  return (
    <div className="flex flex-col h-screen bg-surface text-text-primary">
      {/* Draggable title bar area */}
      <div className="shrink-0" style={{ height: "1.75rem", WebkitAppRegion: "drag" } as any} />

      {/* Tabs */}
      <div className="flex border-b border-ghost-border px-5 shrink-0">
        <button
          onClick={() => setTab("providers")}
          className={`px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] border-b-2 transition-colors ${
            tab === "providers"
              ? "border-ember text-ember-light"
              : "border-transparent text-text-muted hover:text-text-primary"
          }`}
        >
          Providers
        </button>
        <button
          onClick={() => setTab("mcp")}
          className={`px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] border-b-2 transition-colors ${
            tab === "mcp"
              ? "border-ember text-ember-light"
              : "border-transparent text-text-muted hover:text-text-primary"
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
    setProviders((prev) => prev.map((p) => p.id === providerID ? { ...p, connected: false } : p));
    setConnected((prev) => prev.filter((id) => id !== providerID));
    await rpc.request.removeProviderAuth({ providerID });
  };

  const handleDone = async (providerID: string) => {
    setEditingProvider(null);
    setProviders((prev) => prev.map((p) => p.id === providerID ? { ...p, connected: true } : p));
    setConnected((prev) => prev.includes(providerID) ? prev : [...prev, providerID]);
  };

  if (loading) {
    return <div className="font-mono text-[11px] text-text-muted text-center py-8">Loading providers...</div>;
  }

  const filtered = providers
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.connected === b.connected ? 0 : a.connected ? -1 : 1));

  return (
    <div className="space-y-2.5">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search providers..."
        className="w-full bg-surface-200/50 border border-ghost-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-faint outline-none focus:border-surface-500 transition-colors"
      />
      {filtered.map((provider) => (
        <div key={provider.id} className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-display font-semibold">{provider.name}</span>
              <span className="font-mono text-[10px] text-text-faint">{provider.id}</span>
            </div>
            <div className="flex items-center gap-2">
              {provider.connected ? (
                <>
                  <span className="font-mono text-[10px] text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Connected
                  </span>
                  <button
                    onClick={() => handleDisconnect(provider.id)}
                    className="font-mono text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditingProvider(editingProvider === provider.id ? null : provider.id)}
                  className="font-mono text-[10px] px-3 py-1 bg-ember/10 border border-ember/20 hover:bg-ember/20 rounded-full text-ember-light transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {provider.models.length > 0 && (
            <div className="mt-1.5 font-mono text-[10px] text-text-faint">
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
        <div className="font-mono text-[11px] text-text-faint text-center py-8">
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
      <div className="mt-3 font-mono text-[10px] text-text-faint">
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

  const inputClasses = "w-full bg-surface-100 border border-ghost-border rounded-xl px-3.5 py-2 text-xs text-text-primary placeholder:text-text-faint outline-none focus:border-surface-500 transition-colors";

  return (
    <div className="mt-4 pt-4 border-t border-ghost-border space-y-3">
      {methods.length > 1 && (
        <div className="flex gap-2">
          {methods.map((m, i) => (
            <button
              key={i}
              onClick={() => { setSelectedMethod(i); setOauthStep(null); setOauthCode(""); setError(null); setInputs({}); }}
              className={`px-3 py-1 font-mono text-[11px] rounded-full border transition-colors ${
                selectedMethod === i
                  ? "bg-ember-subtle border-ember/30 text-ember-light"
                  : "border-ghost-border text-text-muted hover:text-text-primary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {visiblePrompts.map((prompt) => (
        <div key={prompt.key}>
          <label className="block font-mono text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">{prompt.message}</label>
          {prompt.type === "text" ? (
            <input
              type={prompt.key.toLowerCase().includes("key") || prompt.key.toLowerCase().includes("secret") || prompt.key.toLowerCase().includes("token") ? "password" : "text"}
              value={inputs[prompt.key] ?? ""}
              onChange={(e) => setInput(prompt.key, e.target.value)}
              placeholder={prompt.placeholder ?? ""}
              autoFocus
              className={inputClasses}
              onKeyDown={(e) => {
                if (e.key === "Enter" && method.type === "api") handleApiSubmit();
                if (e.key === "Escape") onCancel();
              }}
            />
          ) : (
            <select
              value={inputs[prompt.key] ?? ""}
              onChange={(e) => setInput(prompt.key, e.target.value)}
              className={inputClasses}
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

      {method.type === "api" && !hasApiKeyPrompt && (
        <div>
          <label className="block font-mono text-[10px] text-text-muted mb-1.5 uppercase tracking-wider">API Key</label>
          <input
            type="password"
            value={inputs["__apiKey"] ?? ""}
            onChange={(e) => setInput("__apiKey", e.target.value)}
            placeholder="Enter API key..."
            autoFocus
            className={inputClasses}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApiSubmit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
      )}

      {method.type === "oauth" && oauthStep && (
        <div className="space-y-2">
          <p className="text-[11px] text-text-muted leading-relaxed">{oauthStep.instructions || "A browser window has opened. Paste the authorization code below."}</p>
          <input
            type="text"
            value={oauthCode}
            onChange={(e) => setOauthCode(e.target.value)}
            placeholder="Paste authorization code..."
            autoFocus
            className={inputClasses}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleOAuthComplete();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
      )}

      {error && <p className="font-mono text-[10px] text-red-400/80">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors rounded-full border border-transparent hover:border-ghost-border"
        >
          Cancel
        </button>
        {method.type === "api" && (
          <button
            onClick={handleApiSubmit}
            disabled={saving}
            className="px-5 py-1.5 bg-ember text-obsidian rounded-full text-xs font-display font-semibold hover:bg-ember-light transition-all shadow-[0_0_20px_var(--color-ember-glow)] disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {method.type === "oauth" && !oauthStep && (
          <button
            onClick={handleOAuthStart}
            disabled={saving}
            className="px-5 py-1.5 bg-ember text-obsidian rounded-full text-xs font-display font-semibold hover:bg-ember-light transition-all shadow-[0_0_20px_var(--color-ember-glow)] disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? "Opening..." : "Authorize"}
          </button>
        )}
        {method.type === "oauth" && oauthStep && (
          <button
            onClick={handleOAuthComplete}
            disabled={saving || !oauthCode.trim()}
            className="px-5 py-1.5 bg-ember text-obsidian rounded-full text-xs font-display font-semibold hover:bg-ember-light transition-all shadow-[0_0_20px_var(--color-ember-glow)] disabled:opacity-40 disabled:shadow-none"
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
      case "connected": return "text-emerald-400";
      case "disabled": return "text-text-faint";
      case "failed": return "text-red-400";
      case "needs_auth": return "text-ember-light";
      default: return "text-text-muted";
    }
  };

  const statusDot = (status: string) => {
    switch (status) {
      case "connected": return "bg-emerald-400";
      case "disabled": return "bg-surface-500";
      case "failed": return "bg-red-400";
      case "needs_auth": return "bg-ember";
      default: return "bg-surface-500";
    }
  };

  if (loading) {
    return <div className="font-mono text-[11px] text-text-muted text-center py-8">Loading MCP servers...</div>;
  }

  const inputClasses = "w-full bg-surface-100 border border-ghost-border rounded-xl px-3.5 py-2 text-xs text-text-primary placeholder:text-text-faint outline-none focus:border-surface-500 transition-colors";

  return (
    <div className="space-y-2.5">
      {servers.map((server) => (
        <div key={server.name} className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-display font-semibold">{server.name}</span>
              <span className={`font-mono text-[10px] flex items-center gap-1.5 ${statusColor(server.status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(server.status)}`} />
                {server.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {server.status === "failed" && (
                <button
                  onClick={() => handleReconnect(server.name)}
                  className="font-mono text-[10px] px-3 py-1 bg-ember/10 border border-ember/20 hover:bg-ember/20 rounded-full text-ember-light transition-colors"
                >
                  Reconnect
                </button>
              )}
              <button
                onClick={() => handleRemove(server.name)}
                className="font-mono text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
          {server.error && (
            <p className="mt-1.5 font-mono text-[10px] text-red-400/80">{server.error}</p>
          )}
          {server.config && (
            <p className="mt-1.5 font-mono text-[10px] text-text-faint">
              {server.config.type === "local"
                ? server.config.command.join(" ")
                : server.config.url}
            </p>
          )}
        </div>
      ))}

      {servers.length === 0 && !showAdd && (
        <div className="font-mono text-[11px] text-text-faint text-center py-6">No MCP servers configured</div>
      )}

      {showAdd ? (
        <div className="glass-card p-5 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setAddType("local")}
              className={`px-3 py-1 font-mono text-[11px] rounded-full border transition-colors ${
                addType === "local"
                  ? "bg-ember-subtle border-ember/30 text-ember-light"
                  : "border-ghost-border text-text-muted hover:text-text-primary"
              }`}
            >
              Local
            </button>
            <button
              onClick={() => setAddType("remote")}
              className={`px-3 py-1 font-mono text-[11px] rounded-full border transition-colors ${
                addType === "remote"
                  ? "bg-ember-subtle border-ember/30 text-ember-light"
                  : "border-ghost-border text-text-muted hover:text-text-primary"
              }`}
            >
              Remote
            </button>
          </div>
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Server name"
            className={inputClasses}
          />
          {addType === "local" ? (
            <input
              type="text"
              value={addCommand}
              onChange={(e) => setAddCommand(e.target.value)}
              placeholder="Command (e.g. npx -y @modelcontextprotocol/server-filesystem)"
              className={inputClasses}
            />
          ) : (
            <input
              type="text"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="Server URL (e.g. https://mcp.example.com/sse)"
              className={inputClasses}
            />
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setAddName(""); setAddCommand(""); setAddUrl(""); }}
              className="px-4 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors rounded-full"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !addName.trim() || (addType === "local" ? !addCommand.trim() : !addUrl.trim())}
              className="px-5 py-1.5 bg-ember text-obsidian rounded-full text-xs font-display font-semibold hover:bg-ember-light transition-all shadow-[0_0_20px_var(--color-ember-glow)] disabled:opacity-40 disabled:shadow-none"
            >
              Add Server
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-3 border border-dashed border-surface-400 rounded-2xl font-mono text-[11px] text-text-muted hover:text-ember-light hover:border-ember/30 transition-colors"
        >
          + Add MCP Server
        </button>
      )}
    </div>
  );
}
