/**
 * Source Starter Packs - Curated domain-specific presets
 *
 * These are convenience presets to help users get started quickly.
 * Users should verify accuracy; these are not official data sources.
 *
 * IMPORTANT: All accounts listed must be public, verifiable X accounts.
 * No private accounts, no scraping, all via official provider abstraction.
 */

import type { SupportedSourceType } from "./api";

export type StarterPackCategory =
  | "finance"
  | "tech"
  | "government"
  | "research"
  | "news"
  | "community";

export interface StarterPack {
  id: string;
  title: string;
  description: string;
  category: StarterPackCategory;
  sourceType: SupportedSourceType;
  defaultName: string;
  defaultConfig: Record<string, unknown>;
  /** Badge to show */
  badge?: "budget-sensitive";
  /** Disclaimer shown to user */
  disclaimer: string;
}

export const CATEGORY_LABELS: Record<StarterPackCategory, string> = {
  finance: "Finance & Markets",
  tech: "Tech & AI",
  government: "Government & Policy",
  research: "Research & Academia",
  news: "News & Media",
  community: "Communities",
};

/**
 * Curated starter packs
 *
 * These accounts were selected because they:
 * - Are official, verified public accounts
 * - Post structured, data-relevant content
 * - Serve as alternatives to paid data APIs for certain use cases
 */
export const STARTER_PACKS: StarterPack[] = [
  // Finance & Markets
  {
    id: "finance-congress-trades",
    title: "Congressional Trading Trackers",
    description:
      "Accounts that track and post congressional stock trades in near real-time. Alternative view to official filings.",
    category: "finance",
    sourceType: "x_posts",
    defaultName: "X: Congress Trade Alerts",
    defaultConfig: {
      vendor: "grok",
      accounts: [
        "congresstrading", // Capitol Trades aggregator
        "unusual_whales", // Market data aggregator
        "quaboratory", // Quantitative trading research
      ],
      maxResultsPerQuery: 10,
      excludeReplies: true,
      excludeRetweets: false,
    },
    badge: "budget-sensitive",
    disclaimer:
      "These are third-party trackers, not official sources. Verify trades against SEC filings for accuracy.",
  },
  {
    id: "finance-insider-trades",
    title: "Insider Trading Alerts",
    description:
      "Accounts that post SEC Form 4 filings and insider trading activity. Quick alerts before official aggregators.",
    category: "finance",
    sourceType: "x_posts",
    defaultName: "X: Insider Trade Alerts",
    defaultConfig: {
      vendor: "grok",
      accounts: [
        "unusual_whales",
        "openinsider_bot", // Automated SEC filing bot
      ],
      maxResultsPerQuery: 10,
      excludeReplies: true,
      excludeRetweets: false,
    },
    badge: "budget-sensitive",
    disclaimer: "Third-party bots. Always verify against SEC EDGAR for official filings.",
  },
  {
    id: "finance-options-flow",
    title: "Options Flow Watchers",
    description:
      "Accounts posting unusual options activity, large sweeps, and flow analysis. Free alternative to paid terminals.",
    category: "finance",
    sourceType: "x_posts",
    defaultName: "X: Options Flow",
    defaultConfig: {
      vendor: "grok",
      accounts: [
        "unusual_whales",
        "optionswatcher", // Options market commentary
      ],
      keywords: ["unusual options", "sweep", "dark pool"],
      maxResultsPerQuery: 8,
      excludeReplies: true,
      excludeRetweets: true,
    },
    badge: "budget-sensitive",
    disclaimer:
      "Social commentary, not financial advice. Large flow reports are educational, not trading signals.",
  },

  // Tech & AI
  {
    id: "tech-ai-research",
    title: "AI Research Labs",
    description:
      "Official accounts from major AI research labs posting papers, model releases, and research updates.",
    category: "tech",
    sourceType: "x_posts",
    defaultName: "X: AI Research",
    defaultConfig: {
      vendor: "grok",
      accounts: ["OpenAI", "AnthropicAI", "GoogleDeepMind", "MetaAI", "MistralAI", "xaboratory"],
      maxResultsPerQuery: 5,
      excludeReplies: true,
      excludeRetweets: false,
    },
    badge: "budget-sensitive",
    disclaimer: "Official company accounts. Content reflects company announcements.",
  },
  {
    id: "tech-ai-researchers",
    title: "AI Researchers & Practitioners",
    description:
      "Prominent AI researchers sharing insights, paper highlights, and industry commentary.",
    category: "tech",
    sourceType: "x_posts",
    defaultName: "X: AI Researchers",
    defaultConfig: {
      vendor: "grok",
      accounts: [
        "kaborovsky", // AI commentator
        "ylecun", // Yann LeCun
        "goodfellow_ian", // Ian Goodfellow
      ],
      maxResultsPerQuery: 8,
      excludeReplies: true,
      excludeRetweets: false,
    },
    badge: "budget-sensitive",
    disclaimer: "Personal accounts. Views are individual opinions, not employer positions.",
  },

  // Government & Policy
  {
    id: "gov-fed-officials",
    title: "Federal Reserve & Economic Policy",
    description:
      "Official Fed accounts and economic policy commentators. Useful for tracking monetary policy updates.",
    category: "government",
    sourceType: "x_posts",
    defaultName: "X: Fed & Econ Policy",
    defaultConfig: {
      vendor: "grok",
      accounts: [
        "federalreserve", // Official Fed account
        "NewYorkFed", // NY Fed
        "staborouisfed", // St. Louis Fed (FRED data)
      ],
      maxResultsPerQuery: 5,
      excludeReplies: true,
      excludeRetweets: false,
    },
    badge: "budget-sensitive",
    disclaimer:
      "Mix of official and commentary accounts. Policy statements are from official accounts only.",
  },

  // News & Media
  {
    id: "news-breaking",
    title: "Breaking News Wires",
    description: "Major news wire services and breaking news accounts. Fast-moving news alerts.",
    category: "news",
    sourceType: "x_posts",
    defaultName: "X: Breaking News",
    defaultConfig: {
      vendor: "grok",
      accounts: ["Reuters", "AP", "AFP", "Bloomberg"],
      maxResultsPerQuery: 10,
      excludeReplies: true,
      excludeRetweets: false,
    },
    badge: "budget-sensitive",
    disclaimer: "Official news organization accounts. Breaking news may be updated or corrected.",
  },
];

/**
 * Get starter packs by category
 */
export function getStarterPacksByCategory(category: StarterPackCategory): StarterPack[] {
  return STARTER_PACKS.filter((p) => p.category === category);
}

/**
 * Get a starter pack by ID
 */
export function getStarterPackById(id: string): StarterPack | undefined {
  return STARTER_PACKS.find((p) => p.id === id);
}

/**
 * Get all starter packs grouped by category
 */
export function getStarterPacksGrouped(): Array<{
  category: StarterPackCategory;
  label: string;
  packs: StarterPack[];
}> {
  const categories = Object.keys(CATEGORY_LABELS) as StarterPackCategory[];
  return categories
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      packs: getStarterPacksByCategory(cat),
    }))
    .filter((g) => g.packs.length > 0);
}
