# Reddit data access by late 2025 -- technical / legal / price notes (updated)

Note: informational summary of public sources; not legal advice.

## 0) What changed (late 2025)
- Reddit moved from "mostly self-serve" to an approval-based model for Data API access:
  - Reddit announced that approval is required for any new OAuth tokens, meaning developers/mods/researchers must request approval to access the public API going forward.
  Source: https://www.reddit.com/r/redditdev/comments/1oug31u/introducing_the_responsible_builder_policy_new/
- Reddit Help documentation (updated Nov 11, 2025) states:
  - The Data API is subject to the Responsible Builder Policy + Developer Terms + Data API Terms.
  - To request access, you must contact Reddit.
  - Clients must authenticate with a registered OAuth token and Reddit may throttle/block unidentified users.
  Source: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki

Practical implication: if you cannot create OAuth credentials / "apps" normally, the most likely root cause is the new approval gate, not browser/captcha quirks.

---

## 1) Can you rely on "public" RSS / unauthenticated JSON for posts + comments?
### RSS
- RSS can work as a post discovery feed (titles/links/metadata; sometimes partial self-post content), but it is not a comments API.
- It is not a reliable path for "fetch full post + comment text at scale".

### Unauthenticated JSON (.json)
- Historically many endpoints were accessible as .json, but the Nov 2025 Data API Wiki says clients must authenticate with a registered OAuth token and Reddit can throttle/block unidentified users.
  Source: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki

Conclusion: for a product that needs post bodies + comment text, assume you need the official Data API with OAuth + approval.

---

## 2) Commercial use rules (subscriptions / paid apps)
Reddit's current policy stack is explicit that monetized products are "commercial" and need permission/contract:

- Responsible Builder Policy (Nov 11, 2025):
  - "If you'd like to use Reddit data for commercial purposes, you'll need explicit written approval."
  Source: https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy

- Developer Terms (Commercial Use Restrictions):
  - You may not access/use Reddit Services & Data "as part of a service or product that is monetized" without written approval.
  - Reddit can charge fees at its discretion and may require a separate agreement for commercial use or higher usage.
  Source: https://redditinc.com/policies/developer-terms (see section "4.1 Commercial Use Restrictions")

- Data API Terms:
  - You may not "sell, lease, or sublicense" Data APIs or derive revenues from use of the Data APIs without express written approval.
  Source: https://redditinc.com/policies/data-api-terms

- Reddit Help ("Developer Platform & Accessing Reddit Data", Nov 11, 2025):
  - Commercial purposes include use "as part of a monetized product or service".
  - If you use Reddit data to power/augment/enhance a product commercially, permission + contract are required.
  Source: https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data

Implication for "paid digest + AI summaries over Reddit posts/comments":
- That is very likely "commercial use" -- you should assume permission/contract required to be compliant.

---

## 3) AI-specific restriction to be aware of
- Developer Terms include a restriction on using Reddit Services & Data (including via API/indexing/crawling) to train large language / AI models without permission.
  Source: https://redditinc.com/policies/developer-terms (see "Other Use Restrictions")

Note: summarization is not the same as training, but if your pipeline involves storing large corpora or feeding into model training/fine-tuning, this clause becomes directly relevant.

---

## 4) Pricing (what's publicly known)
### Publicly stated enterprise tier (2023, still widely referenced)
- Reddit announced an enterprise-level tier priced at $0.24 per 1,000 API calls for apps needing higher usage limits.
  Sources:
  - https://www.reddit.com/r/redditdev/comments/13wsiks/api_update_enterprise_level_tier_for_large_scale/
  - https://www.reddit.com/r/reddit/comments/145bram/addressing_the_community_about_changes_to_our_api/

### Free-tier rate limits (public statement from 2023)
- Reddit stated (July 1, 2023):
  - 100 queries/minute per OAuth client id (OAuth)
  - 10 queries/minute (non-OAuth)
  Source: https://www.reddit.com/r/reddit/comments/145bram/addressing_the_community_about_changes_to_our_api/

### What's not publicly clear for late 2025
- A simple "small dev self-serve pricing page" is not clearly published.
- 2025 Help docs emphasize approval + OAuth token registration and say rules may change; they do not present a full public price sheet.
  Source: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki

Implication: even if the unit price looks affordable, the bigger hurdle is often eligibility/approval + contractual terms for monetized usage.

---

## 5) Options you can realistically ship with (if you cannot afford a contract)
### If you need Reddit comments text for your core value
- The compliant path is: apply for access and see what terms are offered.
- Architecturally, treat Reddit as an optional connector behind a feature flag so you can ship without it.

### If you cannot get commercial approval
- Keep Reddit out of the paid tier (or reduce to "link discovery only" without storing/processing comment corpora).
- Focus paid features on other sources with clearer self-serve access (RSS sites, HN, YouTube transcripts, etc.).

---

## 6) "Why can't I just scrape?"
- Developer Terms prohibit circumventing limits/controls and prohibit masking how/why you access data; monetized scraping raises enforcement risk.
  Source: https://redditinc.com/policies/developer-terms (see "Other Use Restrictions")
- For paid products, "public data" does not automatically mean "free to commercialize".

---

## TL;DR
- By late 2025, Reddit's position is: approved developers + registered OAuth for Data API; commercial use needs explicit permission/contract.
- RSS/unauth JSON are not dependable for "posts + comments ingestion" in a product.
- Publicly stated enterprise price exists ($0.24 / 1k calls), but small-dev commercial terms are not a simple public self-serve menu.
