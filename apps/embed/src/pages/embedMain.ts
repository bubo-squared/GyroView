import { startEmbedPage } from './embedPage';

// The page's entry point: the one place a side effect belongs.
startEmbedPage(globalThis as Window & typeof globalThis);
