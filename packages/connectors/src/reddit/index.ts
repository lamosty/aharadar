import type { Connector } from "../types";
import { fetchReddit } from "./fetch";
import { normalizeReddit } from "./normalize";

export const redditConnector: Connector = {
  sourceType: "reddit",
  fetch: fetchReddit,
  normalize: normalizeReddit
};


