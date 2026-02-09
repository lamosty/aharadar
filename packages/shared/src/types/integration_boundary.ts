export type ContractVersionV1 = "v1";

export type AharadarEventTypeV1 = "bookmark.saved" | "bookmark.removed" | "research.saved";

export interface AharadarEventSourceV1 {
  system: string;
  component: string;
  instance: string;
}

export interface AharadarEventActorV1 {
  user_ref: string;
  session_ref?: string;
}

export interface AharadarContentItemSubjectV1 {
  kind: "content_item";
  id: string;
  url?: string | null;
  title?: string | null;
}

export interface AharadarResearchNoteSubjectV1 {
  kind: "research_note";
  id: string;
}

export interface BookmarkSavedPayloadV1 {
  bookmark_id: string;
  saved_at: string;
  title?: string | null;
  source_type?: string | null;
}

export interface BookmarkRemovedPayloadV1 {
  bookmark_id: string;
  removed_at: string;
  reason: string;
}

export interface ResearchSavedPayloadV1 {
  title?: string | null;
  body_md: string;
  content_item_ids: string[];
  saved_at: string;
}

export interface BookmarkSavedEventEnvelopeV1 {
  contract_version: ContractVersionV1;
  event_id: string;
  event_type: "bookmark.saved";
  event_time: string;
  trace_id: string;
  idempotency_key: string;
  source: AharadarEventSourceV1;
  actor: AharadarEventActorV1;
  subject: AharadarContentItemSubjectV1;
  payload: BookmarkSavedPayloadV1;
}

export interface BookmarkRemovedEventEnvelopeV1 {
  contract_version: ContractVersionV1;
  event_id: string;
  event_type: "bookmark.removed";
  event_time: string;
  trace_id: string;
  idempotency_key: string;
  source: AharadarEventSourceV1;
  actor: AharadarEventActorV1;
  subject: AharadarContentItemSubjectV1;
  payload: BookmarkRemovedPayloadV1;
}

export interface ResearchSavedEventEnvelopeV1 {
  contract_version: ContractVersionV1;
  event_id: string;
  event_type: "research.saved";
  event_time: string;
  trace_id: string;
  idempotency_key: string;
  source: AharadarEventSourceV1;
  actor: AharadarEventActorV1;
  subject: AharadarResearchNoteSubjectV1;
  payload: ResearchSavedPayloadV1;
}

export type AharadarEventEnvelopeV1 =
  | BookmarkSavedEventEnvelopeV1
  | BookmarkRemovedEventEnvelopeV1
  | ResearchSavedEventEnvelopeV1;

export type EventSinkStatusV1 = "accepted" | "duplicate";

export interface EventSinkAckV1 {
  ok: boolean;
  contract_version: ContractVersionV1;
  status?: EventSinkStatusV1;
  event_id?: string;
  received_at?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface EventSink {
  publish(event: AharadarEventEnvelopeV1): Promise<EventSinkAckV1>;
}

export interface RelatedContextOptionsV1 {
  include_badges?: boolean;
  include_hints?: boolean;
  max_related?: number;
}

export interface RelatedContextQueryV1 {
  contract_version: ContractVersionV1;
  request_id: string;
  trace_id: string;
  actor: AharadarEventActorV1;
  subject: AharadarContentItemSubjectV1;
  options?: RelatedContextOptionsV1;
}

export type RelatedContextProviderStatusV1 = "fresh" | "cached" | "stale" | "unavailable";

export interface RelatedContextBadgeV1 {
  code: string;
  label: string;
  level: "info" | "warn" | "critical";
  confidence?: number;
}

export interface RelatedContextEntryV1 {
  context_id: string;
  kind: string;
  title: string;
  snippet?: string;
  url?: string;
  relevance?: number;
  reason?: string;
}

export interface RelatedContextResponseV1 {
  ok: true;
  contract_version: ContractVersionV1;
  provider_status: RelatedContextProviderStatusV1;
  generated_at?: string;
  ttl_seconds?: number;
  badges: RelatedContextBadgeV1[];
  hints: string[];
  related_context: RelatedContextEntryV1[];
}

export interface TextSelectionRangeV1 {
  text: string;
  start_offset: number;
  end_offset: number;
}

export interface TextSelectionLookupOptionsV1 {
  max_matches?: number;
}

export interface TextSelectionLookupRequestV1 {
  contract_version: ContractVersionV1;
  request_id: string;
  trace_id: string;
  actor: AharadarEventActorV1;
  subject: AharadarContentItemSubjectV1;
  selection: TextSelectionRangeV1;
  options?: TextSelectionLookupOptionsV1;
}

export interface TextSelectionLookupMatchV1 {
  match_id: string;
  kind: string;
  title: string;
  snippet: string;
  relevance?: number;
  reason?: string;
}

export interface TextSelectionLookupResponseV1 {
  ok: true;
  contract_version: ContractVersionV1;
  provider_status: RelatedContextProviderStatusV1;
  generated_at?: string;
  matches: TextSelectionLookupMatchV1[];
}

export interface RelatedContextProvider {
  getRelatedContext(request: RelatedContextQueryV1): Promise<RelatedContextResponseV1>;
  lookupTextSelection?(
    request: TextSelectionLookupRequestV1,
  ): Promise<TextSelectionLookupResponseV1>;
}
