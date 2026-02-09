import { describe, expect, it } from "vitest";
import {
  buildBookmarkRemovedEvent,
  buildBookmarkSavedEvent,
  buildResearchSavedEvent,
  createBookmarkRemovedIdempotencyKey,
  createBookmarkSavedIdempotencyKey,
  createDeterministicEventId,
  createResearchSavedIdempotencyKey,
  normalizeRelatedContextResponse,
  normalizeTextSelectionResponse,
  unavailableRelatedContextResponse,
  unavailableTextSelectionResponse,
} from "./contracts.js";
import {
  getIntegrationPorts,
  HttpRelatedContextProvider,
  NoopEventSink,
  NullRelatedContextProvider,
  resetIntegrationPortsForTests,
  TimeoutError,
  withTimeout,
} from "./ports.js";

describe("integration contracts", () => {
  it("builds bookmark.saved event with deterministic idempotency and event_id", () => {
    const savedAt = "2026-02-09T14:23:45.112Z";
    const event = buildBookmarkSavedEvent({
      traceId: "trace-1",
      userRef: "user-1",
      sessionRef: "sess-1",
      contentItemId: "11111111-1111-4111-8111-111111111111",
      contentUrl: "https://example.com/post/alpha",
      contentTitle: "Alpha",
      sourceType: "rss",
      bookmarkId: "bmk-1",
      savedAt,
    });

    expect(event.contract_version).toBe("v1");
    expect(event.event_type).toBe("bookmark.saved");
    expect(event.idempotency_key).toBe(
      createBookmarkSavedIdempotencyKey({
        userRef: "user-1",
        contentItemId: "11111111-1111-4111-8111-111111111111",
        savedAt,
      }),
    );
    expect(event.event_id).toBe(createDeterministicEventId(event.idempotency_key));
    expect(event.payload.saved_at).toBe(savedAt);
  });

  it("builds bookmark.removed event with deterministic key shape", () => {
    const removedAt = "2026-02-09T15:02:19.390Z";
    const event = buildBookmarkRemovedEvent({
      traceId: "trace-2",
      userRef: "user-2",
      sessionRef: "sess-2",
      contentItemId: "22222222-2222-4222-8222-222222222222",
      contentUrl: "https://example.com/post/beta",
      contentTitle: "Beta",
      bookmarkId: "bmk-2",
      removedAt,
    });

    expect(event.contract_version).toBe("v1");
    expect(event.event_type).toBe("bookmark.removed");
    expect(event.idempotency_key).toBe(
      createBookmarkRemovedIdempotencyKey({
        userRef: "user-2",
        contentItemId: "22222222-2222-4222-8222-222222222222",
        removedAt,
      }),
    );
    expect(event.payload.reason).toBe("user_toggle");
  });

  it("builds research.saved event with deterministic idempotency key", () => {
    const savedAt = "2026-02-09T16:11:03.004Z";
    const event = buildResearchSavedEvent({
      traceId: "trace-3",
      userRef: "user-3",
      sessionRef: "sess-3",
      researchId: "manual-summary:user-3:item-9",
      savedAt,
      title: "Semiconductor demand notes",
      bodyMd: "- demand acceleration",
      contentItemIds: ["33333333-3333-4333-8333-333333333333"],
    });

    expect(event.contract_version).toBe("v1");
    expect(event.event_type).toBe("research.saved");
    expect(event.idempotency_key).toBe(
      createResearchSavedIdempotencyKey({
        userRef: "user-3",
        researchId: "manual-summary:user-3:item-9",
        savedAt,
      }),
    );
    expect(event.payload.content_item_ids).toHaveLength(1);
    expect(event.payload.saved_at).toBe(savedAt);
  });

  it("normalizes invalid provider responses to fail-open defaults", () => {
    expect(normalizeRelatedContextResponse(null)).toEqual(unavailableRelatedContextResponse());
    expect(normalizeTextSelectionResponse(undefined)).toEqual(unavailableTextSelectionResponse());
  });
});

describe("integration ports defaults", () => {
  it("uses HTTP provider when provider URL env is configured", () => {
    const originalProviderUrl = process.env.AHARADAR_RELATED_CONTEXT_PROVIDER_BASE_URL;
    process.env.AHARADAR_RELATED_CONTEXT_PROVIDER_BASE_URL = "http://provider.internal";

    try {
      resetIntegrationPortsForTests();
      const ports = getIntegrationPorts();
      expect(ports.relatedContextProvider).toBeInstanceOf(HttpRelatedContextProvider);
    } finally {
      if (originalProviderUrl === undefined) {
        delete process.env.AHARADAR_RELATED_CONTEXT_PROVIDER_BASE_URL;
      } else {
        process.env.AHARADAR_RELATED_CONTEXT_PROVIDER_BASE_URL = originalProviderUrl;
      }
      resetIntegrationPortsForTests();
    }
  });

  it("NoopEventSink accepts events", async () => {
    const sink = new NoopEventSink();
    const event = buildBookmarkSavedEvent({
      traceId: "trace-1",
      userRef: "user-1",
      sessionRef: "sess-1",
      contentItemId: "11111111-1111-4111-8111-111111111111",
      contentUrl: "https://example.com/post/alpha",
      contentTitle: "Alpha",
      sourceType: "rss",
      bookmarkId: "bmk-1",
      savedAt: "2026-02-09T14:23:45.112Z",
    });
    const ack = await sink.publish(event);

    expect(ack.ok).toBe(true);
    expect(ack.contract_version).toBe("v1");
    expect(ack.status).toBe("accepted");
    expect(ack.event_id).toBe(event.event_id);
  });

  it("NullRelatedContextProvider returns fail-open defaults", async () => {
    const provider = new NullRelatedContextProvider();
    const related = await provider.getRelatedContext({
      contract_version: "v1",
      request_id: "rel-req-1",
      trace_id: "trace-1",
      actor: { user_ref: "user-1", session_ref: "sess-1" },
      subject: { kind: "content_item", id: "1" },
    });
    const lookup = await provider.lookupTextSelection({
      contract_version: "v1",
      request_id: "txt-req-1",
      trace_id: "trace-1",
      actor: { user_ref: "user-1", session_ref: "sess-1" },
      subject: { kind: "content_item", id: "1" },
      selection: { text: "alpha", start_offset: 0, end_offset: 5 },
    });

    expect(related.provider_status).toBe("unavailable");
    expect(related.badges).toEqual([]);
    expect(related.hints).toEqual([]);
    expect(related.related_context).toEqual([]);
    expect(lookup.provider_status).toBe("unavailable");
    expect(lookup.matches).toEqual([]);
  });

  it("withTimeout rejects long-running promises", async () => {
    await expect(
      withTimeout(
        new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        }),
        5,
        "test-timeout",
      ),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("HTTP related context provider", () => {
  const queryRequest = {
    contract_version: "v1" as const,
    request_id: "rel-req-1",
    trace_id: "trace-rel-1",
    actor: { user_ref: "user-1", session_ref: "sess-1" },
    subject: { kind: "content_item" as const, id: "item-1", title: "Alpha market shift" },
    options: { include_badges: true, include_hints: true, max_related: 3 },
  };

  const textSelectionRequest = {
    contract_version: "v1" as const,
    request_id: "txt-req-1",
    trace_id: "trace-txt-1",
    actor: { user_ref: "user-1", session_ref: "sess-1" },
    subject: { kind: "content_item" as const, id: "item-1" },
    selection: { text: "demand acceleration", start_offset: 10, end_offset: 29 },
    options: { max_matches: 5 },
  };

  it("posts query payload and returns provider response", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new HttpRelatedContextProvider({
      baseUrl: "http://provider.internal/",
      authToken: "token-123",
      fetchImpl: (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        calls.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            ok: true,
            contract_version: "v1",
            provider_status: "fresh",
            badges: [{ code: "in_memory", label: "Seen", level: "info", confidence: 0.8 }],
            hints: ["Related to your notes"],
            related_context: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const response = await provider.getRelatedContext(queryRequest);

    expect(response.ok).toBe(true);
    expect(response.provider_status).toBe("fresh");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://provider.internal/v1/related-context/query");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
    expect(headers["X-Ingest-Token"]).toBe("token-123");
    expect(headers["X-Trace-Id"]).toBe("trace-rel-1");
  });

  it("treats text-selection endpoint as optional on 404", async () => {
    const provider = new HttpRelatedContextProvider({
      baseUrl: "http://provider.internal",
      fetchImpl: (async () => new Response("not found", { status: 404 })) as typeof fetch,
    });

    const response = await provider.lookupTextSelection(textSelectionRequest);
    expect(response).toEqual(unavailableTextSelectionResponse());
  });

  it("throws on malformed non-object JSON payloads", async () => {
    const provider = new HttpRelatedContextProvider({
      baseUrl: "http://provider.internal",
      fetchImpl: (async () =>
        new Response(JSON.stringify("bad-payload"), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });

    await expect(provider.getRelatedContext(queryRequest)).rejects.toThrow(
      "Related context provider returned a non-object JSON payload",
    );
  });
});
