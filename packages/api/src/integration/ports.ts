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
const RELATED_CONTEXT_QUERY_PATH = "/v1/related-context/query";
const RELATED_CONTEXT_TEXT_SELECTION_PATH = "/v1/related-context/text-selection";

function parseEnvString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTimeout(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveRelatedContextProviderBaseUrl(): string | undefined {
  return parseEnvString(
    process.env.AHARADAR_RELATED_CONTEXT_PROVIDER_BASE_URL ??
      process.env.AHARADAR_RELATED_CONTEXT_PROVIDER_URL ??
      process.env.AHARADAR_INTELLIGENCE_PROVIDER_BASE_URL,
  );
}

function resolveRelatedContextProviderAuthToken(): string | undefined {
  return parseEnvString(
    process.env.AHARADAR_RELATED_CONTEXT_PROVIDER_AUTH_TOKEN ??
      process.env.AHARADAR_INTEGRATION_AUTH_TOKEN,
  );
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function ensureObjectBody(body: unknown, label: string): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} returned a non-object JSON payload`);
  }
  return body as Record<string, unknown>;
}

class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
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

export class HttpRelatedContextProvider implements RelatedContextProvider {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(params: { baseUrl: string; authToken?: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = normalizeBaseUrl(params.baseUrl);
    this.authToken = parseEnvString(params.authToken);
    this.fetchImpl = params.fetchImpl ?? fetch;
  }

  async getRelatedContext(request: RelatedContextQueryV1): Promise<RelatedContextResponseV1> {
    const raw = await this.postJson(RELATED_CONTEXT_QUERY_PATH, request.trace_id, request);
    return raw as unknown as RelatedContextResponseV1;
  }

  async lookupTextSelection(
    request: TextSelectionLookupRequestV1,
  ): Promise<TextSelectionLookupResponseV1> {
    try {
      const raw = await this.postJson(
        RELATED_CONTEXT_TEXT_SELECTION_PATH,
        request.trace_id,
        request,
      );
      return raw as unknown as TextSelectionLookupResponseV1;
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 404) {
        // Text-selection lookup is optional at provider boundary.
        return unavailableTextSelectionResponse();
      }
      throw err;
    }
  }

  private buildHeaders(traceId: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Trace-Id": traceId,
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
      headers["X-Ingest-Token"] = this.authToken;
    }

    return headers;
  }

  private async postJson(
    path: string,
    traceId: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.buildHeaders(traceId),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new HttpStatusError(
        response.status,
        `Related context provider request failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = await response.json();
    return ensureObjectBody(body, "Related context provider");
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
  const relatedContextProviderBaseUrl = resolveRelatedContextProviderBaseUrl();
  return {
    eventSink: new NoopEventSink(),
    relatedContextProvider: relatedContextProviderBaseUrl
      ? new HttpRelatedContextProvider({
          baseUrl: relatedContextProviderBaseUrl,
          authToken: resolveRelatedContextProviderAuthToken(),
        })
      : new NullRelatedContextProvider(),
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

let integrationPorts: IntegrationPorts | null = null;

export function getIntegrationPorts(): IntegrationPorts {
  if (!integrationPorts) {
    integrationPorts = defaultIntegrationPorts();
  }
  return integrationPorts;
}

export function configureIntegrationPortsForTests(overrides: Partial<IntegrationPorts>): void {
  const current = getIntegrationPorts();
  integrationPorts = {
    ...current,
    ...overrides,
  };
}

export function resetIntegrationPortsForTests(): void {
  integrationPorts = null;
}
