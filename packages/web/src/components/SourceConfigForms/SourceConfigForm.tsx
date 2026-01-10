"use client";

import type { SupportedSourceType } from "@/lib/api";
import { CongressTradingConfigForm } from "./CongressTradingConfigForm";
import { HnConfigForm } from "./HnConfigForm";
import { MarketSentimentConfigForm } from "./MarketSentimentConfigForm";
import { OptionsFlowConfigForm } from "./OptionsFlowConfigForm";
import { PolymarketConfigForm } from "./PolymarketConfigForm";
import { RedditConfigForm } from "./RedditConfigForm";
import { RssConfigForm } from "./RssConfigForm";
import { SecEdgarConfigForm } from "./SecEdgarConfigForm";
import type {
  CongressTradingConfig,
  HnConfig,
  MarketSentimentConfig,
  OptionsFlowConfig,
  PolymarketConfig,
  RedditConfig,
  RssConfig,
  SecEdgarConfig,
  SourceTypeConfig,
  XPostsConfig,
  YoutubeConfig,
} from "./types";
import { XPostsConfigForm } from "./XPostsConfigForm";
import { YoutubeConfigForm } from "./YoutubeConfigForm";

interface SourceConfigFormProps {
  sourceType: SupportedSourceType;
  config: Partial<SourceTypeConfig>;
  onChange: (config: Partial<SourceTypeConfig>) => void;
  errors?: Record<string, string>;
}

/**
 * Dynamic source configuration form that renders the appropriate
 * form based on the selected source type.
 */
export function SourceConfigForm({ sourceType, config, onChange, errors }: SourceConfigFormProps) {
  switch (sourceType) {
    case "rss":
      return (
        <RssConfigForm value={config as Partial<RssConfig>} onChange={onChange} errors={errors} />
      );

    case "reddit":
      return (
        <RedditConfigForm
          value={config as Partial<RedditConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    case "hn":
      return (
        <HnConfigForm value={config as Partial<HnConfig>} onChange={onChange} errors={errors} />
      );

    case "youtube":
      return (
        <YoutubeConfigForm
          value={config as Partial<YoutubeConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    case "x_posts":
      return (
        <XPostsConfigForm
          value={config as Partial<XPostsConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    case "sec_edgar":
      return (
        <SecEdgarConfigForm
          value={config as Partial<SecEdgarConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    case "congress_trading":
      return (
        <CongressTradingConfigForm
          value={config as Partial<CongressTradingConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    case "polymarket":
      return (
        <PolymarketConfigForm
          value={config as Partial<PolymarketConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    case "options_flow":
      return (
        <OptionsFlowConfigForm
          value={config as Partial<OptionsFlowConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    case "market_sentiment":
      return (
        <MarketSentimentConfigForm
          value={config as Partial<MarketSentimentConfig>}
          onChange={onChange}
          errors={errors}
        />
      );

    // RSS-based types that use feedUrl
    case "podcast":
    case "medium":
      return (
        <RssConfigForm value={config as Partial<RssConfig>} onChange={onChange} errors={errors} />
      );

    // Substack uses publication name
    case "substack":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Publication Name</label>
            <input
              type="text"
              value={(config as { publication?: string }).publication ?? ""}
              onChange={(e) => onChange({ ...config, publication: e.target.value })}
              placeholder="e.g., astralcodexten"
              className="w-full px-3 py-2 border rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">The subdomain from {"{name}"}.substack.com</p>
          </div>
        </div>
      );

    // arXiv uses category
    case "arxiv":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input
              type="text"
              value={(config as { category?: string }).category ?? ""}
              onChange={(e) => onChange({ ...config, category: e.target.value })}
              placeholder="e.g., cs.AI, cs.LG, math.CO"
              className="w-full px-3 py-2 border rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">arXiv category code</p>
          </div>
        </div>
      );

    // Lobsters has optional tag filter
    case "lobsters":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tag (optional)</label>
            <input
              type="text"
              value={(config as { tag?: string }).tag ?? ""}
              onChange={(e) => onChange({ ...config, tag: e.target.value })}
              placeholder="e.g., programming, security"
              className="w-full px-3 py-2 border rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for all stories</p>
          </div>
        </div>
      );

    // Product Hunt uses default feed
    case "producthunt":
      return (
        <div className="text-sm text-gray-500">
          <p>No configuration needed. Fetches from the Product Hunt feed.</p>
        </div>
      );

    // GitHub releases needs owner/repo
    case "github_releases":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Repository Owner</label>
            <input
              type="text"
              value={(config as { owner?: string }).owner ?? ""}
              onChange={(e) => onChange({ ...config, owner: e.target.value })}
              placeholder="e.g., facebook"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Repository Name</label>
            <input
              type="text"
              value={(config as { repo?: string }).repo ?? ""}
              onChange={(e) => onChange({ ...config, repo: e.target.value })}
              placeholder="e.g., react"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </div>
      );

    // Telegram needs channels
    case "telegram":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Channel Usernames</label>
            <input
              type="text"
              value={((config as { channels?: string[] }).channels ?? []).join(", ")}
              onChange={(e) =>
                onChange({
                  ...config,
                  channels: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="e.g., @channel1, @channel2"
              className="w-full px-3 py-2 border rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated list. Bot must be admin in each channel.
            </p>
          </div>
        </div>
      );

    default:
      return (
        <div>
          <p>Unknown source type: {sourceType}</p>
        </div>
      );
  }
}

/**
 * Validate source configuration based on type.
 * Returns an object with field names as keys and error messages as values.
 */
export function validateSourceConfig(
  sourceType: SupportedSourceType,
  config: Partial<SourceTypeConfig>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  switch (sourceType) {
    case "rss": {
      const rssConfig = config as Partial<RssConfig>;
      if (!rssConfig.feedUrl?.trim()) {
        errors.feedUrl = "Feed URL is required";
      } else {
        try {
          new URL(rssConfig.feedUrl);
        } catch {
          errors.feedUrl = "Please enter a valid URL";
        }
      }
      break;
    }

    case "reddit": {
      const redditConfig = config as Partial<RedditConfig>;
      if (!redditConfig.subreddit?.trim()) {
        errors.subreddit = "Subreddit is required";
      }
      break;
    }

    case "hn":
      // No required fields for HN
      break;

    case "youtube": {
      const ytConfig = config as Partial<YoutubeConfig>;
      if (!ytConfig.channelId?.trim()) {
        errors.channelId = "Channel ID is required";
      }
      break;
    }

    case "x_posts": {
      const xConfig = config as Partial<XPostsConfig>;
      if (!xConfig.vendor?.trim()) {
        errors.vendor = "Provider is required";
      }
      // At least one of accounts, keywords, or queries should be set
      const hasContent =
        (xConfig.accounts && xConfig.accounts.length > 0) ||
        (xConfig.keywords && xConfig.keywords.length > 0) ||
        (xConfig.queries && xConfig.queries.length > 0);
      if (!hasContent) {
        errors.accounts = "At least one account, keyword, or query is required";
      }
      break;
    }

    case "sec_edgar": {
      const secConfig = config as Partial<SecEdgarConfig>;
      if (!secConfig.filing_types || secConfig.filing_types.length === 0) {
        errors.filing_types = "At least one filing type is required";
      }
      break;
    }

    case "congress_trading":
      // No required fields - all filters are optional
      break;

    case "polymarket":
      // No required fields - all filters are optional
      break;

    case "options_flow":
      // No required fields - all filters are optional
      break;

    case "market_sentiment": {
      const msConfig = config as Partial<MarketSentimentConfig>;
      if (!msConfig.tickers || msConfig.tickers.length === 0) {
        errors.tickers = "At least one ticker is required";
      }
      break;
    }

    // RSS-based types
    case "podcast":
    case "medium": {
      const rssConfig = config as Partial<RssConfig>;
      if (!rssConfig.feedUrl?.trim()) {
        errors.feedUrl = "Feed URL is required";
      }
      break;
    }

    case "substack": {
      const subConfig = config as { publication?: string; feedUrl?: string };
      if (!subConfig.publication?.trim() && !subConfig.feedUrl?.trim()) {
        errors.publication = "Publication name or feed URL is required";
      }
      break;
    }

    case "arxiv": {
      const arxivConfig = config as { category?: string };
      if (!arxivConfig.category?.trim()) {
        errors.category = "Category is required (e.g., cs.AI)";
      }
      break;
    }

    case "lobsters":
    case "producthunt":
      // No required fields
      break;

    case "github_releases": {
      const ghConfig = config as { owner?: string; repo?: string };
      if (!ghConfig.owner?.trim()) {
        errors.owner = "Repository owner is required";
      }
      if (!ghConfig.repo?.trim()) {
        errors.repo = "Repository name is required";
      }
      break;
    }

    case "telegram": {
      const tgConfig = config as { channels?: string[] };
      if (!tgConfig.channels || tgConfig.channels.length === 0) {
        errors.channels = "At least one channel is required";
      }
      break;
    }
  }

  return errors;
}

/**
 * Get default configuration for a source type.
 */
export function getDefaultConfig(sourceType: SupportedSourceType): Partial<SourceTypeConfig> {
  switch (sourceType) {
    case "rss":
      return {
        feedUrl: "",
        maxItemCount: 50,
        preferContentEncoded: true,
      } as Partial<RssConfig>;

    case "reddit":
      return {
        subreddits: [],
        listing: "new",
        timeFilter: "day",
        includeComments: false,
        includeNsfw: false,
      } as Partial<RedditConfig>;

    case "hn":
      return {
        feed: "top",
      } as Partial<HnConfig>;

    case "youtube":
      return {
        channelId: "",
        maxVideoCount: 30,
        includeTranscript: false,
      } as Partial<YoutubeConfig>;

    case "x_posts":
      return {
        vendor: "grok",
        accounts: [],
        keywords: [],
        queries: [],
        excludeReplies: true,
        excludeRetweets: true,
      } as Partial<XPostsConfig>;

    case "sec_edgar":
      return {
        filing_types: ["form4"],
        max_filings_per_fetch: 50,
      } as Partial<SecEdgarConfig>;

    case "congress_trading":
      return {
        vendor: "stock_watcher",
        max_trades_per_fetch: 50,
      } as Partial<CongressTradingConfig>;

    case "polymarket":
      return {
        max_markets_per_fetch: 50,
      } as Partial<PolymarketConfig>;

    case "options_flow":
      return {
        min_premium: 50000,
        include_etfs: true,
        expiry_max_days: 90,
        max_alerts_per_fetch: 50,
      } as Partial<OptionsFlowConfig>;

    case "market_sentiment":
      return {
        tickers: [],
        min_mentions: 100,
        max_tickers_per_fetch: 10,
      } as Partial<MarketSentimentConfig>;

    // RSS-based types
    case "podcast":
      return {
        feedUrl: "",
        maxItemCount: 50,
      };

    case "substack":
      return {
        publication: "",
        maxItemCount: 50,
      };

    case "medium":
      return {
        feedUrl: "",
        maxItemCount: 50,
      };

    case "arxiv":
      return {
        category: "",
        maxItemCount: 50,
      };

    case "lobsters":
      return {
        tag: "",
        maxItemCount: 50,
      };

    case "producthunt":
      return {
        maxItemCount: 50,
      };

    case "github_releases":
      return {
        owner: "",
        repo: "",
        maxItemCount: 30,
      };

    case "telegram":
      return {
        channels: [],
        maxMessagesPerChannel: 50,
        includeMediaCaptions: true,
        includeForwards: true,
      };

    default:
      return {};
  }
}
