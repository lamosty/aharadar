import type { Connector } from "./types";
import { hnConnector } from "./hn";
import { redditConnector } from "./reddit";
import { rssConnector } from "./rss";
import { signalConnector } from "./signal";
import { youtubeConnector } from "./youtube";

export const CONNECTORS: Connector[] = [redditConnector, hnConnector, rssConnector, youtubeConnector, signalConnector];

export function getConnector(sourceType: string): Connector | undefined {
  return CONNECTORS.find((c) => c.sourceType === sourceType);
}


