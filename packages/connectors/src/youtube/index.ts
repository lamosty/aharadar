import type { Connector } from "../types";
import { fetchYoutube } from "./fetch";
import { normalizeYoutube } from "./normalize";

export const youtubeConnector: Connector = {
  sourceType: "youtube",
  fetch: fetchYoutube,
  normalize: normalizeYoutube
};


