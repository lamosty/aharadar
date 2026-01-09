import { XMLParser } from "fast-xml-parser";

// Helper functions for type coercion
function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function asNumber(value: unknown): number | null {
  const num =
    typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(num) ? num : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Parse SEC EDGAR RSS/Atom XML to extract filing metadata
 * Expected structure: Atom feed with entry elements
 */
export function parseRssAtom(xmlText: string): Array<{
  title: string | null;
  link: string | null;
  published: string | null;
  accessionNumber: string | null;
  filingType: string | null;
}> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) => ["entry", "link", "category"].includes(name),
  });

  try {
    const feed = parser.parse(xmlText) as Record<string, unknown>;
    const entries = asArray<Record<string, unknown>>(asRecord(feed.feed ?? {}).entry);

    const results = [];
    for (const entry of entries) {
      const title = asString(asRecord(entry).title);
      let link: string | null = null;
      let published: string | null = null;
      let accessionNumber: string | null = null;
      let filingType: string | null = null;

      // Extract link (Atom uses array of link objects with @_href attribute)
      const links = asArray<Record<string, unknown>>(asRecord(entry).link);
      if (links.length > 0) {
        const firstLink = links[0];
        link = asString(firstLink["@_href"]) ?? asString(firstLink.href);
      }

      // Extract published date
      published = asString(asRecord(entry).published);

      // Extract accession number from title or link
      if (title) {
        const match = title.match(/(\d{10}-\d{2}-\d{6})/);
        if (match) accessionNumber = match[1];
      }
      if (!accessionNumber && link) {
        const match = link.match(/acc=(\d{10}-\d{2}-\d{6})/);
        if (match) accessionNumber = match[1];
      }

      // Extract filing type (Form 4 or 13F)
      if (title?.includes("Form 4") || title?.includes("/4 ")) {
        filingType = "form4";
      } else if (title?.includes("Form 13F") || title?.includes("13F")) {
        filingType = "13f";
      }

      results.push({
        title,
        link,
        published,
        accessionNumber,
        filingType,
      });
    }

    return results;
  } catch (error) {
    console.warn(`Failed to parse RSS Atom XML: ${error}`);
    return [];
  }
}

/**
 * Parse Form 4 XML filing
 * Extracts transaction details and insider information
 */
export interface Form4Transaction {
  code: string; // P, S, A, D, etc.
  type: string; // purchase, sale, award, disposition, etc.
  shares: number | null;
  pricePerShare: number | null;
  totalValue: number | null;
  sharesOwnedAfter: number | null;
  isDerivative: boolean;
  isDirect: boolean;
  date: string | null; // ISO string
}

export interface Form4Entry {
  accessionNumber: string | null;
  filingDate: string | null;
  insiderName: string | null;
  insiderTitle: string | null;
  companyName: string | null;
  ticker: string | null;
  cik: string | null;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  transactions: Form4Transaction[];
}

export function parseForm4Xml(xmlText: string): Form4Entry | null {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) =>
      ["nonDerivativeTransaction", "derivativeTransaction", "ownershipNature", "value"].includes(
        name,
      ),
  });

  try {
    const doc = parser.parse(xmlText) as Record<string, unknown>;
    const form4 = asRecord(doc.form4 ?? doc.Form4 ?? {});

    // Extract header info
    const headerInfo = asRecord(form4.formData ?? form4.headerData ?? {});
    const filingDate = asString(
      headerInfo.dateOfEvent ?? headerInfo.reportingDate ?? headerInfo.filingDate,
    );
    const accessionNumber = asString(headerInfo.accessionNumber);

    // Extract issuer (company) information
    const issuer = asRecord(form4.issuer ?? {});
    const companyName = asString(issuer.companyName ?? issuer.issuerName);
    const ticker = asString(issuer.issuerTradingSymbol ?? issuer.ticker);
    const cik = asString(issuer.issuerCentralIndexKey ?? issuer.cik);

    // Extract reporting owner (insider) information
    const reportingOwner = asRecord(form4.reportingOwner ?? {});
    const reportingOwnerId = asRecord(reportingOwner.reportingOwnerId ?? {});
    const insiderName = asString(reportingOwnerId.rptOwnerName ?? reportingOwnerId.name);
    const reportingOwnerRel = asRecord(reportingOwner.reportingOwnerRelationship ?? {});
    const insiderTitle = asString(reportingOwnerRel.officerTitle ?? reportingOwner.title);

    // Extract relationship flags
    const relationship = asRecord(reportingOwner.reportingOwnerRelationship ?? {});
    const isDirector = relationship.isDirector === true || relationship.isDirector === "1";
    const isOfficer = relationship.isOfficer === true || relationship.isOfficer === "1";
    const isTenPercentOwner =
      relationship.isTenPercentOwner === true || relationship.isTenPercentOwner === "1";

    // Extract transactions
    const transactions: Form4Transaction[] = [];
    const nonDerivative = asArray<Record<string, unknown>>(
      asRecord(form4.nonDerivativeTable ?? {}).nonDerivativeTransaction,
    );
    const derivative = asArray<Record<string, unknown>>(
      asRecord(form4.derivativeTable ?? {}).derivativeTransaction,
    );

    // Process non-derivative transactions
    for (const txn of nonDerivative) {
      const txnRecord = asRecord(txn);
      const code = asString(txnRecord.transactionCode);
      const txnShares = asRecord(txnRecord.transactionShares ?? {});
      const txnPrice = asRecord(txnRecord.transactionPrice ?? {});
      const txnDate = asRecord(txnRecord.transactionDate ?? {});
      const directOwn = asRecord(txnRecord.directOrIndirectOwnership ?? {});
      const sharesOwned = asRecord(txnRecord.sharesOwnedFollowingTransaction ?? {});
      const shares = asNumber(txnShares.value ?? txnRecord.shares);
      const price = asNumber(txnPrice.value ?? txnRecord.price);
      const value = shares && price ? shares * price : null;
      const sharesAfter = asNumber(sharesOwned.value ?? txnRecord.sharesAfter);
      const date = asString(txnDate.value ?? txnRecord.date);
      const direct = asString(directOwn.value ?? "D");

      if (code && shares !== null) {
        transactions.push({
          code,
          type: mapTransactionCode(code),
          shares,
          pricePerShare: price,
          totalValue: value,
          sharesOwnedAfter: sharesAfter,
          isDerivative: false,
          isDirect: direct === "D",
          date,
        });
      }
    }

    // Process derivative transactions
    for (const txn of derivative) {
      const txnRecord = asRecord(txn);
      const code = asString(txnRecord.transactionCode);
      const txnShares = asRecord(txnRecord.transactionShares ?? {});
      const txnPrice = asRecord(txnRecord.transactionPrice ?? {});
      const txnDate = asRecord(txnRecord.transactionDate ?? {});
      const directOwn = asRecord(txnRecord.directOrIndirectOwnership ?? {});
      const sharesOwned = asRecord(txnRecord.sharesOwnedFollowingTransaction ?? {});
      const shares = asNumber(txnShares.value ?? txnRecord.shares);
      const price = asNumber(txnPrice.value ?? txnRecord.price);
      const value = shares && price ? shares * price : null;
      const sharesAfter = asNumber(sharesOwned.value ?? txnRecord.sharesAfter);
      const date = asString(txnDate.value ?? txnRecord.date);
      const direct = asString(directOwn.value ?? "D");

      if (code && shares !== null) {
        transactions.push({
          code,
          type: mapTransactionCode(code),
          shares,
          pricePerShare: price,
          totalValue: value,
          sharesOwnedAfter: sharesAfter,
          isDerivative: true,
          isDirect: direct === "D",
          date,
        });
      }
    }

    if (!companyName || !ticker || !cik || !insiderName) {
      return null; // Malformed, missing critical fields
    }

    return {
      accessionNumber,
      filingDate,
      insiderName,
      insiderTitle,
      companyName,
      ticker,
      cik,
      isDirector,
      isOfficer,
      isTenPercentOwner,
      transactions,
    };
  } catch (error) {
    console.warn(`Failed to parse Form 4 XML: ${error}`);
    return null;
  }
}

/**
 * Parse 13F XML filing
 * Extracts institutional holdings information
 */
export interface Form13fHolding {
  ticker: string | null;
  name: string | null;
  shares: number | null;
  value: number | null; // in thousands
  shrsType: string | null; // 'SH' for shares, 'PRN' for principal
}

export interface Form13fEntry {
  accessionNumber: string | null;
  filingDate: string | null;
  reportPeriod: string | null;
  institutionName: string | null;
  cik: string | null;
  totalValue: number | null; // in thousands
  holdings: Form13fHolding[];
}

export function parse13fXml(xmlText: string): Form13fEntry | null {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) => ["infoTable", "row"].includes(name),
  });

  try {
    const doc = parser.parse(xmlText) as Record<string, unknown>;
    // 13F XML can have various root elements (form13finfotable, informationTable, etc.)
    const root = asRecord(doc.form13finfotable ?? doc.informationTable ?? doc);

    // Try to find header/cover info
    let accessionNumber: string | null = null;
    let filingDate: string | null = null;
    let reportPeriod: string | null = null;
    let institutionName: string | null = null;
    let cik: string | null = null;
    const totalValue: number | null = null;

    // Search for common 13F header fields
    if (asRecord(root).coverPage) {
      const cover = asRecord(root.coverPage);
      filingDate = asString(cover.filingDate ?? cover.reportDate);
      reportPeriod = asString(cover.reportPeriod ?? cover.reportCalendarOrQuarter);
      institutionName = asString(cover.filerName ?? cover.managerName);
      cik = asString(cover.cik ?? cover.centralIndexKey);
      accessionNumber = asString(cover.accessionNumber);
    }

    // Extract info table (holdings)
    const holdings: Form13fHolding[] = [];
    const infoTable = asArray<Record<string, unknown>>(
      asRecord(root.infoTable ?? root.informationTable).row ??
        asRecord(root.infoTable ?? root.informationTable).infoTable,
    );

    for (const row of infoTable) {
      const rowRecord = asRecord(row);
      const ticker = asString(rowRecord.titleOfClass ?? rowRecord.cusip);
      const name = asString(rowRecord.nameOfIssuer);
      const shrsOrPrnAmtRecord = asRecord(rowRecord.shrsOrPrnAmt ?? {});
      const shares = asNumber(shrsOrPrnAmtRecord.value ?? rowRecord.shares);
      const value = asNumber(rowRecord.value ?? rowRecord.marketValue);
      const shrsType = asString(shrsOrPrnAmtRecord["@_shrsOrPrnType"] ?? rowRecord.shrsType);

      if (name || ticker) {
        holdings.push({
          ticker,
          name,
          shares,
          value,
          shrsType: shrsType ?? "SH",
        });
      }
    }

    // Validate minimal fields
    if (!institutionName || !cik || holdings.length === 0) {
      return null; // Malformed
    }

    return {
      accessionNumber,
      filingDate,
      reportPeriod,
      institutionName,
      cik,
      totalValue,
      holdings,
    };
  } catch (error) {
    console.warn(`Failed to parse 13F XML: ${error}`);
    return null;
  }
}

/**
 * Map SEC transaction code to human-readable type
 */
function mapTransactionCode(code: string): string {
  const mapping: Record<string, string> = {
    P: "purchase",
    S: "sale",
    A: "award",
    D: "disposition",
    M: "exercise",
    X: "exercise",
    C: "conversion",
    E: "expiration",
    H: "holding",
    O: "other",
    F: "payment",
    I: "intra-company transfer",
    Z: "conversion of derivative",
  };
  return mapping[code.toUpperCase()] ?? "unknown";
}
