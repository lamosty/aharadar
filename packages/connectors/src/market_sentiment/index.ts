import type { Connector } from "../types";
import { fetchMarketSentiment } from "./fetch";
import { normalizeMarketSentiment } from "./normalize";

export const marketSentimentConnector: Connector = {
  sourceType: "market_sentiment",
  fetch: fetchMarketSentiment,
  normalize: normalizeMarketSentiment,
};
