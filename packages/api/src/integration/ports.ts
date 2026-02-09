import type {
  AharadarEventEnvelopeV1,
  EventSink,
  EventSinkAckV1,
  RelatedContextProvider,
  RelatedContextQueryV1,
  RelatedContextResponseV1,
  TextSelectionLookupRequestV1,
  TextSelectionLookupResponseV1,
} from "@aharadar/shared/src/types/integration_boundary";
import {
  CONTRACT_VERSION_V1,
  unavailableRelatedContextResponse,
  unavailableTextSelectionResponse,
} from "./contracts.js";

const DEFAULT_EVENT_SINK_TIMEOUT_MS = 200;
const DEFAULT_RELATED_CONTEXT_TIMEOUT_MS = 250;

function parseTimeout(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export class NoopEventSink implements EventSink {
  async publish(event: AharadarEventEnvelopeV1): Promise<EventSinkAckV1> {
    return {
      ok: true,
      contract_version: CONTRACT_VERSION_V1,
      status: "accepted",
      event_id: event.event_id,
      received_at: new Date().toISOString(),
    };
  }
}

export class NullRelatedContextProvider implements RelatedContextProvider {
  async getRelatedContext(_request: RelatedContextQueryV1): Promise<RelatedContextResponseV1> {
    return unavailableRelatedContextResponse();
  }

  async lookupTextSelection(
    _request: TextSelectionLookupRequestV1,
  ): Promise<TextSelectionLookupResponseV1> {
    return unavailableTextSelectionResponse();
  }
}

export class TimeoutError extends Error {
  constructor(
    readonly timeoutMs: number,
    readonly label: string,
  ) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new TimeoutError(timeoutMs, label)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export interface IntegrationPorts {
  eventSink: EventSink;
  relatedContextProvider: RelatedContextProvider;
  eventSinkTimeoutMs: number;
  relatedContextTimeoutMs: number;
}

function defaultIntegrationPorts(): IntegrationPorts {
  return {
    eventSink: new NoopEventSink(),
    relatedContextProvider: new NullRelatedContextProvider(),
    eventSinkTimeoutMs: parseTimeout(
      process.env.AHARADAR_EVENT_SINK_TIMEOUT_MS,
      DEFAULT_EVENT_SINK_TIMEOUT_MS,
    ),
    relatedContextTimeoutMs: parseTimeout(
      process.env.AHARADAR_RELATED_CONTEXT_TIMEOUT_MS,
      DEFAULT_RELATED_CONTEXT_TIMEOUT_MS,
    ),
  };
}

let integrationPorts: IntegrationPorts = defaultIntegrationPorts();

export function getIntegrationPorts(): IntegrationPorts {
  return integrationPorts;
}

export function configureIntegrationPortsForTests(overrides: Partial<IntegrationPorts>): void {
  integrationPorts = {
    ...integrationPorts,
    ...overrides,
  };
}

export function resetIntegrationPortsForTests(): void {
  integrationPorts = defaultIntegrationPorts();
}
