// This file is ONLY for VS Code/TypeScript (tsserver) so it stops erroring.
// Supabase Edge Functions run on Deno and already provide the real `Deno` global.

declare const Deno: any;
