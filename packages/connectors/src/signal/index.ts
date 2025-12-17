import type { Connector } from "../types";
import { fetchSignal } from "./fetch";
import { normalizeSignal } from "./normalize";

export const signalConnector: Connector = {
  sourceType: "signal",
  fetch: fetchSignal,
  normalize: normalizeSignal
};


