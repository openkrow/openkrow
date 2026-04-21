/**
 * WorkspaceManager — Manages workspace context.
 */

export interface WorkspaceContext {
  projectName: string;
  path: string;
}

export class WorkspaceManager {
  private context: WorkspaceContext | null = null;

  load(path: string): WorkspaceContext {
    this.context = { projectName: path.split("/").pop() || "project", path };
    return this.context;
  }

  getContext(): WorkspaceContext | null {
    return this.context;
  }

  isLoaded(): boolean {
    return this.context !== null;
  }
}
