/**
 * The printed document chrome, shared by every platform's till.
 *
 * This is the Appliance Outlet "modern document" layout - the same header band,
 * party cards, black-headed item table, totals column and receipt signature
 * lines - lifted out of `nca-crm/utils/print` and parameterised, so a second
 * platform gets the identical form with its own brand on it rather than a
 * second copy of the code to keep in step.
 *
 * Two things are deliberately data-driven rather than hardcoded per brand:
 *
 * - The lockup. A brand with a logo image prints it; one without falls back to
 *   the composed wordmark, which is what Appliance Outlet uses.
 * - Every optional identity row (website, email, phone, tax registration). A
 *   business that has not supplied one prints nothing there, rather than a
 *   blank label or an invented number on a customer's invoice.
 */

export interface PosBusiness {
  /** Printed as the wordmark when there is no logo, and as the party name. */
  name: string;
  /** Printed in place of the composed wordmark when supplied. */
  logoUrl?: string | null;
  /** Already-formatted address lines; empty entries are dropped. */
  addressLines?: string[];
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  /** e.g. "GST#" / "UBI #". Both parts are needed or the row is skipped. */
  registrationLabel?: string | null;
  registrationNumber?: string | null;
  currencySign?: string;
  /** The store's own terms, printed verbatim in the terms band. */
  terms?: string | null;
  /** Document accent, used for the balance line and negative amounts. */
  accent?: string;
}

export interface PosDocumentParty {
  name?: string | null;
  lines?: string[];
}

export interface PosDocumentItem {
  quantity: number;
  description: string;
  /** Serial or SKU, shown in its own column on the slips. */
  reference?: string | null;
  /** A-D grade, printed on the invoice only. */
  grade?: string | null;
  /** Plain words for the grade ("Good", "Like new"), printed under the letter. */
  gradeLabel?: string | null;
  /** Extra lines under the description: rental period, add-ons, condition. */
  details?: string[];
  unitPrice?: number;
  amount?: number;
}

export interface PosDocumentTotalRow {
  label: string;
  value: number;
  emphasis?: boolean;
  negative?: boolean;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Print-safe text: the supplied forms use ordinary ASCII hyphens. */
export const printText = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === ""
    ? ""
    : escapeHtml(String(value).replace(/[‐-―−]/g, "-"));

export const printMoney = (
  value: number | string | null | undefined,
  business: PosBusiness,
): string => {
  const raw = Number(value ?? 0);
  const amount = Math.abs(raw).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${raw < 0 ? "-" : ""}${business.currencySign ?? "$"} ${amount}`;
};

const DEFAULT_ACCENT = "#b52f3a";

/**
 * Composed wordmark: the name with its last word in the accent, matching the
 * Appliance Outlet lockup. Only reached when the brand has no logo image.
 */
const wordmark = (business: PosBusiness): string => {
  if (business.logoUrl) {
    return `<div class="modern-lockup"><img src="${printText(business.logoUrl)}" alt="${printText(
      business.name,
    )}" onerror="this.style.display='none';" /></div>`;
  }
  const name = business.name
    .replace(/\s+(LLC|Inc\.?|Ltd\.?)$/i, "")
    .trim()
    .toUpperCase();
  const words = name.split(/\s+/);
  const accent = words.pop() ?? "";
  return `<div class="modern-wordmark">${printText(words.join(" "))} <span>${printText(accent)}</span></div>`;
};

const storeLines = (business: PosBusiness): string[] =>
  [
    business.name,
    ...(business.addressLines ?? []),
    business.phone ? `Phone: ${business.phone}` : "",
  ].filter(Boolean) as string[];

const partyCard = (label: string, party: PosDocumentParty): string => `
	<div class="modern-party">
		<div class="modern-party-label">${printText(label)}</div>
		${party.name ? `<div class="modern-party-name">${printText(party.name)}</div>` : ""}
		${(party.lines ?? [])
      .filter(Boolean)
      .map((line) => `<div>${printText(line)}</div>`)
      .join("")}
	</div>`;

export interface PosHeaderOptions {
  title: string;
  business: PosBusiness;
  number: string;
  date: string;
  dateLabel: string;
  dateValue?: string | null;
  soldTo: PosDocumentParty;
  shipTo: PosDocumentParty & { label?: string };
  /** "INVOICE #" on a sale, "AGREEMENT #" on a rental. */
  numberLabel?: string;
}

export const modernHeader = (options: PosHeaderOptions): string => {
  const { business } = options;
  const registration =
    business.registrationLabel && business.registrationNumber
      ? `<div class="modern-registration">${printText(business.registrationLabel)} ${printText(
          business.registrationNumber,
        )}</div>`
      : "";

  return `
	<header class="modern-header">
		<div>
			${wordmark(business)}
			<div class="modern-store-address">
				${storeLines(business)
          .map((line) => `<div>${printText(line)}</div>`)
          .join("")}
			</div>
		</div>
		<div class="modern-document-heading">
			<h1>${printText(options.title)}</h1>
			${business.website ? `<div>${printText(business.website)}</div>` : ""}
			${business.email ? `<div>${printText(business.email)}</div>` : ""}
			${registration}
		</div>
	</header>
	<div class="modern-meta">
		<div><strong>${printText(options.numberLabel ?? "INVOICE #")}</strong> ${printText(options.number)} <strong>DATE</strong> ${printText(options.date)}</div>
		<div><strong>${printText(options.dateLabel)}</strong> ${printText(options.dateValue || "To be scheduled")}</div>
	</div>
	<div class="modern-parties">
		${partyCard("SOLD TO", options.soldTo)}
		${partyCard(options.shipTo.label ?? "SHIP TO", options.shipTo)}
	</div>`;
};

const itemDescription = (item: PosDocumentItem): string => {
  const metadata = [
    item.reference ? `Serial ${item.reference}` : "",
    ...(item.details ?? []),
  ].filter(Boolean);

  return `<strong>${printText(item.description)}</strong>${
    metadata.length
      ? `<div class="modern-item-detail">${metadata.map((line) => printText(line)).join(" | ")}</div>`
      : ""
  }`;
};

/** The priced table: what the customer is being charged for, itemised. */
/**
 * What the GRADE column prints. An assessed unit has a letter, A to D. A unit
 * nobody has graded yet reports "UNASSESSED", which is a state and not a grade,
 * so it reads "Not assessed". A line with no unit at all prints a dash.
 */
export const printGrade = (grade: string | null | undefined): string => {
  const code = String(grade ?? "").trim().toUpperCase();
  if (!code) return "-";
  return /^[A-D]$/.test(code) ? code : "Not assessed";
};

export const modernInvoiceItems = (
  items: PosDocumentItem[],
  business: PosBusiness,
): string => `
	<table class="modern-items modern-invoice-items">
		<thead><tr>
			<th class="qty">QTY</th><th>DESCRIPTION</th><th>REFERENCE</th>
			<th class="center">GRADE</th><th>RATE</th><th>AMOUNT</th>
		</tr></thead>
		<tbody>
			${items
        .map(
          (item) => `<tr>
				<td class="qty">${printText(item.quantity)}</td>
				<td>${itemDescription(item)}</td>
				<td>${printText(item.reference)}</td>
				<td class="center">${printText(printGrade(item.grade))}${/^[A-Da-d]$/.test(String(item.grade ?? "")) && item.gradeLabel ? `<div class="modern-item-detail">${printText(item.gradeLabel)}</div>` : ""}</td>
				<td class="money">${item.unitPrice === undefined ? "" : printMoney(item.unitPrice, business)}</td>
				<td class="money">${item.amount === undefined ? "" : printMoney(item.amount, business)}</td>
			</tr>`,
        )
        .join("")}
		</tbody>
	</table>`;

/**
 * The unpriced table. A slip is a handover record for the crew and the
 * customer, so it carries no money at all beyond the balance line.
 */
export const modernSlipItems = (
  items: PosDocumentItem[],
  statusLabel: string,
  statusDetail: string,
): string => `
	<table class="modern-items modern-slip-items">
		<thead><tr>
			<th class="qty">QTY</th><th>DESCRIPTION</th><th>ITEM #</th><th>STATUS</th>
		</tr></thead>
		<tbody>
			${items
        .map(
          (item) => `<tr>
				<td class="qty">${printText(item.quantity)}</td>
				<td>${itemDescription(item)}</td>
				<td>${printText(item.reference)}</td>
				<td>${printText(statusLabel)}${statusDetail ? `<div class="modern-item-detail">${printText(statusDetail)}</div>` : ""}</td>
			</tr>`,
        )
        .join("")}
		</tbody>
	</table>`;

export const modernTotals = (
  rows: PosDocumentTotalRow[],
  business: PosBusiness,
): string => `
	<table class="modern-totals"><tbody>
		${rows
      .map(
        (row, index) => `<tr class="${[
          row.emphasis ? "emphasis" : "",
          row.emphasis && index === 0 ? "alone" : "",
          row.negative ? "negative" : "",
        ]
          .filter(Boolean)
          .join(" ")}">
			<td>${printText(row.label)}</td>
			<td>${printMoney(row.negative ? -Math.abs(row.value) : row.value, business)}</td>
		</tr>`,
      )
      .join("")}
	</tbody></table>`;

/**
 * A blank receipt block: printed name, signature and date lines.
 *
 * ! Deliberately takes no signature. A slip is proof that the goods changed
 * ! hands, and it is signed when they do - printing the signature captured at
 * ! the till would be a receipt for a handover nobody has made yet.
 */
/**
 * The three lines a slip is signed on. When the customer's signature was
 * captured at the till it is printed above the signature line, so the slip
 * carries it; without one the line is left blank to be signed by hand.
 */
export const modernReceiptSignature = (signature?: string | null): string => `
	<div class="modern-receipt-lines">
		<div><span>PRINTED NAME</span></div>
		<div>${signature ? `<img src="${printText(signature)}" alt="" onerror="this.style.display='none';" />` : ""}<span>CUSTOMER SIGNATURE</span></div>
		<div><span>DATE</span></div>
	</div>`;

export const instructionSteps = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(\d+[.)]|[-*•])\s*/, "")
        .trim(),
    )
    .filter(Boolean);

export const modernInstructions = (
  label: string,
  value?: string | null,
): string => {
  const steps = instructionSteps(value);
  if (steps.length === 0) return "";
  if (steps.length === 1) {
    return `<div class="modern-agreement"><strong>${printText(label)}:</strong> ${printText(steps[0])}</div>`;
  }
  return `<div class="modern-agreement"><strong>${printText(label)}:</strong><ol class="modern-steps">${steps
    .map((step) => `<li>${printText(step)}</li>`)
    .join("")}</ol></div>`;
};

/** The store's own terms, printed verbatim, one paragraph per blank line. */
export const modernTerms = (business: PosBusiness): string => {
  const terms = String(business.terms ?? "").trim();
  if (!terms) return "";
  return `<div class="modern-invoice-terms">${terms
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        `<div class="modern-legal">${printText(paragraph.replace(/\s*\n\s*/g, " "))}</div>`,
    )
    .join("")}</div>`;
};

export const modernStyles = (business: PosBusiness): string => {
  const accent = business.accent ?? DEFAULT_ACCENT;
  return `
* { box-sizing: border-box; }
/*
 * A sheet margin of our own: with none set, a print dialog on minimal margins
 * put the document title against - and past - the top edge of the page.
 */
@page { size: auto; margin: 0.5in 0.45in 0.5in; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
	font-family: Arial, Helvetica, sans-serif;
	font-size: 8.25pt;
	line-height: 1.35;
	color: #111;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}
.modern-document { width: 100%; max-width: 7.35in; margin: 0 auto; padding-top: 0.2in; }
.modern-header {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.35in;
	align-items: start;
	padding: 0 0.11in 0.18in;
	border-bottom: 2px solid #111;
}
.modern-wordmark { font-size: 18pt; font-weight: 900; letter-spacing: 0.2px; line-height: 1; white-space: nowrap; }
.modern-wordmark span { color: ${accent}; }
/* The logo replaces the wordmark in the same slot and keeps its baseline. */
.modern-lockup img { display: block; max-height: 0.62in; max-width: 2.6in; width: auto; object-fit: contain; }
.modern-store-address { margin-top: 7px; font-size: 7.6pt; line-height: 1.35; }
.modern-document-heading { text-align: right; font-size: 7.4pt; line-height: 1.45; }
.modern-document-heading h1 { margin: 0 0 6px; font-size: 16pt; letter-spacing: 3.2px; line-height: 1; }
.modern-registration { margin-top: 5px; font-weight: 700; }
.modern-meta { display: flex; justify-content: space-between; gap: 18px; padding: 16px 10px 15px; font-size: 8pt; }
.modern-meta strong { margin-right: 3px; }
.modern-meta strong:not(:first-child) { margin-left: 11px; }
.modern-parties { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #9b9b9b; }
.modern-party { min-height: 0.72in; padding: 10px 12px; }
.modern-party + .modern-party { border-left: 1px solid #9b9b9b; }
.modern-party-label { margin-bottom: 3px; color: #666; font-size: 6.8pt; letter-spacing: 1.7px; font-weight: 700; }
.modern-party-name { font-weight: 700; }
.modern-items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 8px; }
.modern-items thead { display: table-header-group; }
.modern-items th { padding: 8px 10px; background: #111; color: #fff; font-size: 7.2pt; letter-spacing: 1px; text-align: left; }
.modern-items td { padding: 10px; border-bottom: 1px solid #dedede; vertical-align: top; }
.modern-items tr { break-inside: avoid; page-break-inside: avoid; }
.modern-items .qty, .modern-items .center { text-align: center; }
.modern-items .money { text-align: right; white-space: nowrap; }
.modern-item-detail { margin-top: 2px; color: #333; font-size: 6.8pt; line-height: 1.35; }
.modern-invoice-items th:nth-child(1) { width: 7%; }
.modern-invoice-items th:nth-child(2) { width: 43%; }
.modern-invoice-items th:nth-child(3) { width: 15%; }
.modern-invoice-items th:nth-child(4) { width: 12%; }
.modern-invoice-items th:nth-child(5) { width: 12%; text-align: right; }
.modern-invoice-items th:nth-child(6) { width: 11%; text-align: right; }
.modern-invoice-items td { padding-top: 6px; padding-bottom: 6px; }
.modern-invoice-items td:nth-child(4) { padding-left: 5px; padding-right: 5px; overflow-wrap: anywhere; word-break: break-word; font-size: 6.5pt; }
.modern-slip-items th:nth-child(1) { width: 8%; }
.modern-slip-items th:nth-child(2) { width: 56%; }
.modern-slip-items th:nth-child(3) { width: 18%; }
.modern-slip-items th:nth-child(4) { width: 18%; }
.modern-balance { margin: 17px 10px 18px; text-align: right; color: ${accent}; font-size: 10.5pt; font-weight: 800; }
.modern-acknowledgement { padding: 9px 0 12px; font-size: 7.3pt; }
.modern-agreement { padding: 8px 0; border-top: 1px solid #888; border-bottom: 1px solid #888; font-size: 6.5pt; }
.modern-steps { margin: 5px 0 0; padding-left: 19px; }
.modern-steps li + li { margin-top: 3px; }
.modern-receipt-lines { display: grid; grid-template-columns: 1.2fr 1.15fr 0.62fr; gap: 20px; margin: 34px 10px 16px; }
.modern-receipt-lines > div { position: relative; height: 26px; border-top: 1px solid #111; }
.modern-receipt-lines img { position: absolute; left: 0; bottom: 100%; max-height: 32px; max-width: 100%; }
.modern-receipt-lines span { display: block; padding-top: 4px; font-size: 6.6pt; letter-spacing: 1.1px; }
.modern-receipt-note { color: #777; font-size: 6.2pt; }
.modern-thank-you { margin-top: 8px; text-align: center; font-size: 8.8pt; font-weight: 800; letter-spacing: 1.8px; }
.modern-legal { font-size: 6.4pt; line-height: 1.35; }
.modern-legal + .modern-legal { margin-top: 7px; }
.modern-summary-area { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 36px; padding: 19px 10px 0; }
.modern-payment-title { font-size: 7pt; font-weight: 800; letter-spacing: 1px; }
.modern-payment-line { margin-top: 4px; font-size: 7.2pt; }
.modern-recurring-title { margin-top: 14px; font-size: 7pt; font-weight: 800; letter-spacing: 1px; }
.modern-recurring-title + .modern-totals { margin-top: 4px; }
.modern-payment-note { margin-top: 5px; color: #666; font-size: 6.4pt; line-height: 1.35; }
.modern-totals { width: 100%; border-collapse: collapse; }
.modern-totals td { padding: 3px 0; }
.modern-totals td:last-child { width: 35%; text-align: right; white-space: nowrap; }
.modern-totals tr.emphasis td { padding-top: 4px; border-top: 1px solid #bcbcbc; font-weight: 800; }
.modern-totals tr.emphasis.alone td { padding-top: 0; border-top: none; }
.modern-totals tr.negative { color: ${accent}; }
.modern-invoice-terms { break-inside: avoid; page-break-inside: avoid; margin: 18px 10px 0; padding-top: 10px; border-top: 1px solid #888; }
.modern-invoice-signature { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 22px; }
.modern-invoice-signature > div { min-height: 44px; border-top: 1px solid #111; padding-top: 4px; font-size: 6.5pt; letter-spacing: 0.8px; }
.modern-invoice-signature img { display: block; max-height: 36px; max-width: 100%; margin-top: -42px; }
.modern-survey { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #969696; margin-top: 8px; }
.modern-survey-single { grid-template-columns: 1fr; }
.modern-survey-panel { min-height: 1.35in; padding: 10px 11px; }
.modern-survey-panel + .modern-survey-panel { border-left: 1px solid #969696; }
.modern-section-label { color: #666; font-size: 6.8pt; letter-spacing: 1.4px; }
.modern-survey-row { margin-top: 5px; }
.modern-fill-line { display: inline-block; width: 0.7in; height: 0.1in; border-bottom: 1px solid #555; vertical-align: bottom; }
.modern-choice { display: inline-block; margin-left: 5px; padding: 1px 5px; border: 1px solid #666; font-size: 6.3pt; }
.modern-choice.selected { background: #111; color: #fff; font-weight: 700; }
.modern-charge-table { width: 100%; margin-top: 7px; border-collapse: collapse; font-size: 6.5pt; }
.modern-charge-table td { padding: 6px; border: 1px solid #969696; }
.modern-charge-table td:last-child { width: 42%; text-align: right; white-space: nowrap; }
@page { size: letter; margin: 0 0.55in 0.45in; }
@media print { body { padding: 0; } .modern-document { max-width: none; } }
`;
};

export const documentShell = (
  title: string,
  body: string,
  business: PosBusiness,
): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${printText(title)}</title>
	<style>${modernStyles(business)}</style>
</head>
<body><main class="modern-document">${body}</main></body>
</html>`;

/**
 * Hands the document to a print window.
 *
 * Returns false when the popup was blocked, so the caller can say so rather
 * than leaving an operator waiting for a dialog that will never appear.
 */
export const openPrintWindow = (html: string): boolean => {
  const printWindow = window.open("", "_blank", "width=850,height=1000");
  if (!printWindow) return false;

  printWindow.document.write(html);
  printWindow.document.close();

  const send = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      /* The window went away, or the browser refused. Nothing to undo. */
    }
  };

  printWindow.addEventListener("afterprint", () => printWindow.close());
  // Images (the logo) must be decoded before the dialog opens, or the sheet
  // prints with a gap where the brand should be.
  if (printWindow.document.readyState === "complete") setTimeout(send, 250);
  else printWindow.addEventListener("load", () => setTimeout(send, 250));

  return true;
};
