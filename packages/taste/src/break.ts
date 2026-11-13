// TASTE_BREAK=1 deliberately breaks the model so each test can be seen failing once
// (`bun run test:broken`). Never set it otherwise.
export const broken = (): boolean => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.TASTE_BREAK === "1";
