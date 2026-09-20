declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * Makes `https://<hostName>/...` answer with this test server's content, so a test can load
     * the embed page from a second origin without a second server.
     */
    serveOtherOrigin: (hostName: string) => Promise<void>;
  }
}

export {};
