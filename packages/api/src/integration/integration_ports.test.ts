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
import { NoopEventSink, NullRelatedContextProvider, TimeoutError, withTimeout } from "./ports.js";

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
