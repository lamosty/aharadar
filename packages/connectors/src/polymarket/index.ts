import type { Connector } from "../types";
import { fetchPolymarket } from "./fetch";
import { normalizePolymarket } from "./normalize";

export const polymarketConnector: Connector = {
  sourceType: "polymarket",
  fetch: fetchPolymarket,
  normalize: normalizePolymarket,
};
