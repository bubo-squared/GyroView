declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * Writes a data URL to `.artifacts/<name>` in the repository and returns the path.
     */
    saveArtifact: (name: string, dataUrl: string) => Promise<string>;
  }
}

export {};
