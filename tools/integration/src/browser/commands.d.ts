declare module 'vitest' {
  interface ProvidedContext {
    /**
     * Whether the run writes renders and measurements to `.artifacts/` (`pnpm measure`).
     */
    savesArtifacts: boolean;
  }
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * Writes a data URL to `.artifacts/<name>` in the repository and returns the path.
     */
    saveArtifact: (name: string, dataUrl: string) => Promise<string>;
  }
}

export {};
