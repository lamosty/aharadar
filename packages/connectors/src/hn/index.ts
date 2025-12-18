import type { Connector } from "../types";
import { fetchHn } from "./fetch";
import { normalizeHn } from "./normalize";

export const hnConnector: Connector = {
  sourceType: "hn",
  fetch: fetchHn,
  normalize: normalizeHn,
};
