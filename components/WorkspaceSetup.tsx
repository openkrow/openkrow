import { useState, useEffect } from "react";
import { rpc } from "../mainview/rpc";
import { KrowLogo } from "./KrowLogo";

type WorkspaceSetupProps = {
  onWorkspaceReady: (path: string, isNew: boolean, projectDetails?: string) => void;
  initialPath: string | null;
  loadingMessage: string;
};

type Step = "pick" | "details" | "loading";

export default function WorkspaceSetup({ onWorkspaceReady, initialPath, loadingMessage }: WorkspaceSetupProps) {
  const [step, setStep] = useState<Step>(initialPath ? "loading" : "pick");
  const [error, setError] = useState<string | null>(null);
  const [projectDetails, setProjectDetails] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(initialPath);
  const [statusMessage, setStatusMessage] = useState(loadingMessage);

  // If we have an initial path, auto-validate on mount
  useEffect(() => {
    if (initialPath) {
      handlePathSelected(initialPath);
    }
  }, []);

  async function handlePickFolder() {
    setError(null);
    const res = await rpc.request.pickFolder({});
    if ("cancelled" in res) return;
    if ("error" in res) {
      setError(res.error);
      return;
    }
    await handlePathSelected(res.path);
  }

  async function handlePathSelected(path: string) {
    setSelectedPath(path);
    setError(null);
    setStep("loading");
    setStatusMessage("Validating workspace...");

    const validation = await rpc.request.validateWorkspace({ path });
    if ("error" in validation) {
      setError(validation.error);
      setStep("pick");
      return;
    }

    if (validation.hasAgentsMd) {
      // Existing workspace — go straight to init
      onWorkspaceReady(path, false);
    } else if (validation.exists) {
      // Folder exists but no AGENTS.md — new workspace, ask for details
      setStep("details");
    } else {
      // Folder doesn't exist at all
      setError("Folder does not exist. Please select an existing folder.");
      setStep("pick");
    }
  }

  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectDetails.trim() || !selectedPath) return;

    setStep("loading");
    setStatusMessage("Downloading workspace template...");

    // Download workspace-starter and remove .git
    const setupRes = await rpc.request.setupNewWorkspace({ path: selectedPath });
    if ("error" in setupRes) {
      setError(setupRes.error);
      setStep("details");
      return;
    }

    // Now init workspace and send setup prompt
    onWorkspaceReady(selectedPath, true, projectDetails.trim());
  }

  // ─── Pick folder step ───
  if (step === "pick") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface relative z-10">
        <div className="flex flex-col items-center gap-6 animate-reveal max-w-md w-full px-6">
          <div className="w-14 h-14 glass-card flex items-center justify-center">
            <KrowLogo className="w-9 h-9 text-text-primary" />
          </div>

          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold text-primary tracking-tight">
              Open<span className="text-[#fb923c]">Krow</span>
            </h1>
          </div>

          <p className="font-mono text-[12px] text-muted text-center">
            Choose a folder for your workspace
          </p>

          <button
            onClick={handlePickFolder}
            className="w-full py-3 px-4 rounded-lg bg-[#fb923c]/10 border border-[#fb923c]/30 text-[#fb923c] font-mono text-sm hover:bg-[#fb923c]/20 transition-colors cursor-pointer"
          >
            Select Folder
          </button>

          {error && (
            <p className="text-red-400/80 text-xs text-center font-mono">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Project details step ───
  if (step === "details") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface relative z-10">
        <div className="flex flex-col items-center gap-6 animate-reveal max-w-lg w-full px-6">
          <div className="w-14 h-14 glass-card flex items-center justify-center">
            <KrowLogo className="w-9 h-9 text-text-primary" />
          </div>

          <div className="text-center">
            <h2 className="font-display text-lg font-bold text-primary tracking-tight mb-1">
              New Workspace
            </h2>
            <p className="font-mono text-[11px] text-muted">
              {selectedPath}
            </p>
          </div>

          <form onSubmit={handleDetailsSubmit} className="w-full flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[11px] text-muted uppercase tracking-wider">
                Tell us about your project
              </label>
              <textarea
                value={projectDetails}
                onChange={(e) => setProjectDetails(e.target.value)}
                placeholder="What is this project? What does it do? What tech stack are you using? Any specific rules or constraints?"
                className="w-full h-40 p-3 rounded-lg bg-surface-secondary border border-border text-text-primary font-mono text-[13px] placeholder:text-muted/50 resize-none focus:outline-none focus:border-[#fb923c]/50"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={!projectDetails.trim()}
              className="w-full py-3 px-4 rounded-lg bg-[#fb923c]/10 border border-[#fb923c]/30 text-[#fb923c] font-mono text-sm hover:bg-[#fb923c]/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Setup Workspace
            </button>
          </form>

          {error && (
            <p className="text-red-400/80 text-xs text-center font-mono">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Loading step ───
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-surface relative z-10">
      <div className="flex flex-col items-center gap-6 animate-reveal">
        <div className="w-14 h-14 glass-card flex items-center justify-center">
          <KrowLogo className="w-9 h-9 text-text-primary" />
        </div>

        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-bold text-primary tracking-tight">
            Open<span className="text-[#fb923c]">Krow</span>
          </h1>
        </div>

        <div className="flex flex-col items-center gap-3 animate-fade delay-2">
          <span className="font-mono text-[13px] text-[#fb923c] tracking-wider animate-braille" />
          <p className="font-mono text-[11px] text-muted tracking-wide">{statusMessage}</p>
        </div>
      </div>
    </div>
  );
}
