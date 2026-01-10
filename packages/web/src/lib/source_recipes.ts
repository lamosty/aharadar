/**
 * Source Recipes - Quick-start templates for adding sources
 *
 * Recipes are generic templates that help users get started quickly.
 * They pre-fill source configuration with sensible defaults.
 */

import type { SupportedSourceType } from "./api";

export interface SourceRecipe {
  id: string;
  title: string;
  description: string;
  sourceType: SupportedSourceType;
  defaultName: string;
  defaultConfig: Record<string, unknown>;
  /** Which config fields the user should fill in */
  userFillFields: string[];
  /** Badge to show (budget-sensitive, etc.) */
  badge?: "budget-sensitive";
}

/**
 * Generic recipes for X (via Grok) sources
 */
export const SOURCE_RECIPES: SourceRecipe[] = [
  {
    id: "x-follow-accounts",
    title: "Follow X Accounts",
    description:
      "Monitor posts from specific X/Twitter accounts. Enter usernames to track their content in your feed.",
    sourceType: "x_posts",
    defaultName: "X: My Followed Accounts",
    defaultConfig: {
      vendor: "grok",
      accounts: [],
      maxResultsPerQuery: 10,
      excludeReplies: true,
      excludeRetweets: false,
    },
    userFillFields: ["accounts"],
    badge: "budget-sensitive",
  },
  {
    id: "x-monitor-keywords",
    title: "Monitor X Keywords",
    description:
      "Track X posts mentioning specific keywords or topics. Great for staying on top of discussions.",
    sourceType: "x_posts",
    defaultName: "X: Topic Tracker",
    defaultConfig: {
      vendor: "grok",
      keywords: [],
      maxResultsPerQuery: 10,
      excludeReplies: true,
      excludeRetweets: true,
    },
    userFillFields: ["keywords"],
    badge: "budget-sensitive",
  },
  {
    id: "x-advanced-query",
    title: "Advanced X Query",
    description:
      'Use X search operators for complex queries. Example: "AI startup" min_faves:100 -crypto',
    sourceType: "x_posts",
    defaultName: "X: Custom Search",
    defaultConfig: {
      vendor: "grok",
      queries: [],
      maxResultsPerQuery: 10,
      excludeReplies: true,
      excludeRetweets: true,
    },
    userFillFields: ["queries"],
    badge: "budget-sensitive",
  },
];

/**
 * Get a recipe by ID
 */
export function getRecipeById(id: string): SourceRecipe | undefined {
  return SOURCE_RECIPES.find((r) => r.id === id);
}

/**
 * Get all X-related recipes
 */
export function getXRecipes(): SourceRecipe[] {
  return SOURCE_RECIPES.filter((r) => r.sourceType === "x_posts");
}
