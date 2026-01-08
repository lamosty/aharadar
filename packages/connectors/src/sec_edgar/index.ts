import type { Connector } from "../types";
import { fetchSecEdgar } from "./fetch";
import { normalizeSecEdgar } from "./normalize";

export const secEdgarConnector: Connector = {
  sourceType: "sec_edgar",
  fetch: fetchSecEdgar,
  normalize: normalizeSecEdgar,
};
