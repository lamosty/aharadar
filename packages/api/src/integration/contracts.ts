import { createHash } from "node:crypto";
import type {
  BookmarkRemovedEventEnvelopeV1,
  BookmarkSavedEventEnvelopeV1,
  ContractVersionV1,
  RelatedContextResponseV1,
  ResearchSavedEventEnvelopeV1,
  TextSelectionLookupResponseV1,
} from "@aharadar/shared/src/types/integration_boundary";

export const CONTRACT_VERSION_V1: ContractVersionV1 = "v1";

const DEFAULT_SOURCE = {
  system: "aharadar",
  component: "api",
  instance: "primary",
} as const;

function hashHex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function createDeterministicEventId(idempotencyKey: string): string {
  const chars = hashHex(idempotencyKey).slice(0, 32).split("");
  chars[12] = "5";
  const variant = parseInt(chars[16], 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20, 32).join("")}`;
}

export function createDeterministicRequestId(prefix: string, stableInput: string): string {
  return `${prefix}-${hashHex(stableInput).slice(0, 12)}`;
}

export function createTraceId(headerValue: unknown, requestId: string): string {
  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  if (Array.isArray(headerValue)) {
    const first = headerValue.find((v) => typeof v === "string" && v.trim().length > 0);
    if (typeof first === "string") {
      return first.trim();
    }
  }
  return `trace-${requestId}`;
}

export function createBookmarkSavedIdempotencyKey(params: {
  userRef: string;
  contentItemId: string;
  savedAt: string;
}): string {
  return `bookmark.saved:${params.userRef}:${params.contentItemId}:${params.savedAt}`;
}

export function createBookmarkRemovedIdempotencyKey(params: {
  userRef: string;
  contentItemId: string;
  removedAt: string;
}): string {
  return `bookmark.removed:${params.userRef}:${params.contentItemId}:${params.removedAt}`;
}

export function createResearchSavedIdempotencyKey(params: {
  userRef: string;
  researchId: string;
  savedAt: string;
}): string {
  return `research.saved:${params.userRef}:${params.researchId}:${params.savedAt}`;
}

export function buildBookmarkSavedEvent(params: {
  traceId: string;
  userRef: string;
  sessionRef: string;
  contentItemId: string;
  contentUrl?: string | null;
  contentTitle?: string | null;
  sourceType?: string | null;
  bookmarkId: string;
  savedAt: string;
}): BookmarkSavedEventEnvelopeV1 {
  const idempotencyKey = createBookmarkSavedIdempotencyKey({
    userRef: params.userRef,
    contentItemId: params.contentItemId,
    savedAt: params.savedAt,
  });

  return {
    contract_version: CONTRACT_VERSION_V1,
    event_id: createDeterministicEventId(idempotencyKey),
    event_type: "bookmark.saved",
    event_time: params.savedAt,
    trace_id: params.traceId,
    idempotency_key: idempotencyKey,
    source: DEFAULT_SOURCE,
    actor: {
      user_ref: params.userRef,
      session_ref: params.sessionRef,
    },
    subject: {
      kind: "content_item",
      id: params.contentItemId,
      url: params.contentUrl ?? null,
      title: params.contentTitle ?? null,
    },
    payload: {
      bookmark_id: params.bookmarkId,
      saved_at: params.savedAt,
      title: params.contentTitle ?? null,
      source_type: params.sourceType ?? null,
    },
  };
}

export function buildBookmarkRemovedEvent(params: {
  traceId: string;
  userRef: string;
  sessionRef: string;
  contentItemId: string;
  contentUrl?: string | null;
  contentTitle?: string | null;
  bookmarkId: string;
  removedAt: string;
}): BookmarkRemovedEventEnvelopeV1 {
  const idempotencyKey = createBookmarkRemovedIdempotencyKey({
    userRef: params.userRef,
    contentItemId: params.contentItemId,
    removedAt: params.removedAt,
  });

  return {
    contract_version: CONTRACT_VERSION_V1,
    event_id: createDeterministicEventId(idempotencyKey),
    event_type: "bookmark.removed",
    event_time: params.removedAt,
    trace_id: params.traceId,
    idempotency_key: idempotencyKey,
    source: DEFAULT_SOURCE,
    actor: {
      user_ref: params.userRef,
      session_ref: params.sessionRef,
    },
    subject: {
      kind: "content_item",
      id: params.contentItemId,
      url: params.contentUrl ?? null,
      title: params.contentTitle ?? null,
    },
    payload: {
      bookmark_id: params.bookmarkId,
      removed_at: params.removedAt,
      reason: "user_toggle",
    },
  };
}

export function buildResearchSavedEvent(params: {
  traceId: string;
  userRef: string;
  sessionRef: string;
  researchId: string;
  savedAt: string;
  title?: string | null;
  bodyMd: string;
  contentItemIds: string[];
}): ResearchSavedEventEnvelopeV1 {
  const idempotencyKey = createResearchSavedIdempotencyKey({
    userRef: params.userRef,
    researchId: params.researchId,
    savedAt: params.savedAt,
  });

  return {
    contract_version: CONTRACT_VERSION_V1,
    event_id: createDeterministicEventId(idempotencyKey),
    event_type: "research.saved",
    event_time: params.savedAt,
    trace_id: params.traceId,
    idempotency_key: idempotencyKey,
    source: DEFAULT_SOURCE,
    actor: {
      user_ref: params.userRef,
      session_ref: params.sessionRef,
    },
    subject: {
      kind: "research_note",
      id: params.researchId,
    },
    payload: {
      title: params.title ?? null,
      body_md: params.bodyMd,
      content_item_ids: params.contentItemIds,
      saved_at: params.savedAt,
    },
  };
}

export function unavailableRelatedContextResponse(): RelatedContextResponseV1 {
  return {
    ok: true,
    contract_version: CONTRACT_VERSION_V1,
    provider_status: "unavailable",
    badges: [],
    hints: [],
    related_context: [],
  };
}

export function unavailableTextSelectionResponse(): TextSelectionLookupResponseV1 {
  return {
    ok: true,
    contract_version: CONTRACT_VERSION_V1,
    provider_status: "unavailable",
    matches: [],
  };
}

export function normalizeRelatedContextResponse(
  response: Partial<RelatedContextResponseV1> | null | undefined,
): RelatedContextResponseV1 {
  if (!response || response.ok !== true) {
    return unavailableRelatedContextResponse();
  }

  return {
    ok: true,
    contract_version: CONTRACT_VERSION_V1,
    provider_status: response.provider_status ?? "unavailable",
    generated_at: response.generated_at,
    ttl_seconds: response.ttl_seconds,
    badges: Array.isArray(response.badges) ? response.badges : [],
    hints: Array.isArray(response.hints) ? response.hints : [],
    related_context: Array.isArray(response.related_context) ? response.related_context : [],
  };
}

export function normalizeTextSelectionResponse(
  response: Partial<TextSelectionLookupResponseV1> | null | undefined,
): TextSelectionLookupResponseV1 {
  if (!response || response.ok !== true) {
    return unavailableTextSelectionResponse();
  }

  return {
    ok: true,
    contract_version: CONTRACT_VERSION_V1,
    provider_status: response.provider_status ?? "unavailable",
    generated_at: response.generated_at,
    matches: Array.isArray(response.matches) ? response.matches : [],
  };
}
