import type { Connector } from "../types";
import { fetchPodcast } from "./fetch";
import { normalizePodcast } from "./normalize";

export const podcastConnector: Connector = {
  sourceType: "podcast",
  fetch: fetchPodcast,
  normalize: normalizePodcast,
};

export { type PodcastSourceConfig, parsePodcastSourceConfig } from "./config";
export type { PodcastRawEntry } from "./fetch";
