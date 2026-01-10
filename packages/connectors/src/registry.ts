import { arxivConnector } from "./arxiv";
import { congressTradingConnector } from "./congress_trading";
import { githubReleasesConnector } from "./github_releases";
import { hnConnector } from "./hn";
import { lobstersConnector } from "./lobsters";
import { marketSentimentConnector } from "./market_sentiment";
import { mediumConnector } from "./medium";
import { optionsFlowConnector } from "./options_flow";
import { podcastConnector } from "./podcast";
import { polymarketConnector } from "./polymarket";
import { producthuntConnector } from "./producthunt";
import { redditConnector } from "./reddit";
import { rssConnector } from "./rss";
import { secEdgarConnector } from "./sec_edgar";
import { substackConnector } from "./substack";
import { telegramConnector } from "./telegram";
import type { Connector } from "./types";
import { xPostsConnector } from "./x_posts";
import { youtubeConnector } from "./youtube";

export const CONNECTORS: Connector[] = [
  arxivConnector,
  redditConnector,
  hnConnector,
  rssConnector,
  substackConnector,
  mediumConnector,
  podcastConnector,
  lobstersConnector,
  secEdgarConnector,
  congressTradingConnector,
  polymarketConnector,
  optionsFlowConnector,
  marketSentimentConnector,
  youtubeConnector,
  xPostsConnector,
  producthuntConnector,
  githubReleasesConnector,
  telegramConnector,
];

export function getConnector(sourceType: string): Connector | undefined {
  return CONNECTORS.find((c) => c.sourceType === sourceType);
}
