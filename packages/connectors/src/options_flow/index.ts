import type { Connector } from "../types";
import { fetchOptionsFlow } from "./fetch";
import { normalizeOptionsFlow } from "./normalize";

export const optionsFlowConnector: Connector = {
  sourceType: "options_flow",
  fetch: fetchOptionsFlow,
  normalize: normalizeOptionsFlow,
};
