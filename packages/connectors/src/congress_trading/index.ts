import type { Connector } from "../types";
import { fetchCongressTrading } from "./fetch";
import { normalizeCongressTrading } from "./normalize";

export const congressTradingConnector: Connector = {
  sourceType: "congress_trading",
  fetch: fetchCongressTrading,
  normalize: normalizeCongressTrading,
};
