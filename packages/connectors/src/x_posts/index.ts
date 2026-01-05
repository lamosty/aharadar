import type { Connector } from "../types";
import { fetchXPosts } from "./fetch";
import { normalizeXPosts } from "./normalize";

export const xPostsConnector: Connector = {
  sourceType: "x_posts",
  fetch: fetchXPosts,
  normalize: normalizeXPosts,
};
