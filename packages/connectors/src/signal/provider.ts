/**
 * Signal connector provider — re-exports from shared module.
 *
 * The actual implementation is in x_shared/grok_x_search.ts for reuse
 * by both signal and x_posts connectors (Task 002 refactor).
 */
export {
  type GrokXSearchParams,
  type GrokXSearchResult,
  grokXSearch,
} from "../x_shared/grok_x_search";
