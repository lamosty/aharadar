import type { Connector } from "./types";
import { congressTradingConnector } from "./congress_trading";
import { hnConnector } from "./hn";
import { optionsFlowConnector } from "./options_flow";
import { polymarketConnector } from "./polymarket";
import { redditConnector } from "./reddit";
import { rssConnector } from "./rss";
import { secEdgarConnector } from "./sec_edgar";
import { signalConnector } from "./signal";
import { xPostsConnector } from "./x_posts";
import { youtubeConnector } from "./youtube";

export const CONNECTORS: Connector[] = [
  redditConnector,
  hnConnector,
  rssConnector,
  secEdgarConnector,
  congressTradingConnector,
  polymarketConnector,
  optionsFlowConnector,
  youtubeConnector,
  signalConnector,
  xPostsConnector,
];

export function getConnector(sourceType: string): Connector | undefined {
  return CONNECTORS.find((c) => c.sourceType === sourceType);
}
