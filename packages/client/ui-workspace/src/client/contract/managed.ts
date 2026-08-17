/**
 * Optional workspace-protection service: a host composition marks workspaces
 * users must not delete (app-managed projects). The browser hides the delete
 * affordance for them; an absent service leaves every workspace deletable.
 */
export interface ManagedWorkspaces {
  /** True when the workspace at this path is managed and must not be deleted. */
  isManaged(path: string): boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional guard consulted by the workspace delete affordance. */
    managedWorkspaces?: ManagedWorkspaces
  }
}
