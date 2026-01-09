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
import { SignalConfigForm } from "./SignalConfigForm";
import type {
  CongressTradingConfig,
  HnConfig,
  MarketSentimentConfig,
  OptionsFlowConfig,
  PolymarketConfig,
  RedditConfig,
  RssConfig,
  SecEdgarConfig,
  SignalConfig,
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

    case "signal":
      return (
        <SignalConfigForm
          value={config as Partial<SignalConfig>}
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

    case "signal": {
      const sigConfig = config as Partial<SignalConfig>;
      if (!sigConfig.provider?.trim()) {
        errors.provider = "Provider is required";
      }
      if (!sigConfig.vendor?.trim()) {
        errors.vendor = "Vendor is required";
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

    case "signal":
      return {
        provider: "x_search",
        vendor: "grok",
        accounts: [],
        keywords: [],
        queries: [],
        extractUrls: true,
        extractEntities: false,
        excludeReplies: true,
        excludeRetweets: true,
      } as Partial<SignalConfig>;

    case "sec_edgar":
      return {
        filing_types: ["form4"],
        max_filings_per_fetch: 50,
      } as Partial<SecEdgarConfig>;

    case "congress_trading":
      return {
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

    default:
      return {};
  }
}
