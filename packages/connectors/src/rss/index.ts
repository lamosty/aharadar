import type { Connector } from "../types";
import { fetchRss } from "./fetch";
import { normalizeRss } from "./normalize";

export const rssConnector: Connector = {
  sourceType: "rss",
  fetch: fetchRss,
  normalize: normalizeRss,
};
