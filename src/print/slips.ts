/**
 * The three documents a completed till transaction produces.
 *
 * Same forms as the Appliance Outlet till prints, built on the shared chrome in
 * `document.ts`: an Invoice the customer keeps, and a Pickup or Delivery slip
 * signed when the goods actually change hands.
 *
 * ! Neither slip reproduces the signature captured at the till. That signature
 * ! says "I agree to this sale"; a slip says "I received these goods", and the
 * ! second has not happened yet when the slip is printed. Each slip carries a
 * ! blank block instead and is signed on receipt.
 */

import {
  documentShell,
  modernHeader,
  modernInstructions,
  modernInvoiceItems,
  modernReceiptSignature,
  modernSlipItems,
  modernTerms,
  modernTotals,
  printMoney,
  printText,
  type PosBusiness,
  type PosDocumentItem,
  type PosDocumentParty,
  type PosDocumentTotalRow,
} from "./document";

export interface PosSaleDocument {
  business: PosBusiness;
  /** The order number the platform assigned. */
  number: string;
  date: string;
  kind: "SALE" | "RENTAL";
  fulfilment: "pickup" | "delivery";
  soldTo: PosDocumentParty;
  shipTo: PosDocumentParty;
  items: PosDocumentItem[];
  totals: PosDocumentTotalRow[];
  /** Future rental commitment, kept separate from the amount paid today. */
  recurringSummary?: PosDocumentTotalRow[];
  paymentNote?: string | null;
  /** Still owed when the goods are handed over; normally zero at a till. */
  balance: number;
  /** What the rental agreement runs for, printed under the dates. */
  term?: string | null;
  tender?: string | null;
  notes?: string | null;
  deliveryInstructions?: string | null;
  pickupInstructions?: string | null;
  /** Exact stair counts captured for the delivery crew at checkout. */
  stepsOutside?: number | null;
  stepsInside?: number | null;
  entranceDoor?: "single" | "double" | null;
  entranceLevel?: "ground" | "upstairs" | "basement" | null;
  hosesBought?: boolean | null;
  doorRemoval?: boolean | null;
  dryerVent?: boolean | null;
  /** Captured at the till. Printed on the invoice only - never on a slip. */
  signature?: string | null;
  scheduledFor?: string | null;
  /**
   * Issued by the platform with the invoice. Some stores will not release a
   * pickup without it, so it belongs on the slip the customer takes away.
   */
  pickupCode?: string | null;
}

const numberLabel = (document: PosSaleDocument) =>
  document.kind === "RENTAL" ? "AGREEMENT #" : "INVOICE #";

const header = (document: PosSaleDocument, title: string, dateLabel: string) =>
  modernHeader({
    title,
    business: document.business,
    number: document.number,
    date: document.date,
    numberLabel: numberLabel(document),
    dateLabel,
    dateValue: document.scheduledFor,
    soldTo: document.soldTo,
    shipTo: document.shipTo,
  });

export const buildInvoiceHTML = (document: PosSaleDocument): string => {
  const { business } = document;
  const body = `
	${header(document, document.kind === "RENTAL" ? "RENTAL INVOICE" : "INVOICE", document.fulfilment === "delivery" ? "DELIVERY DATE" : "COLLECTED")}
	${modernInvoiceItems(document.items, business)}
	<div class="modern-summary-area">
		<div>
			<div class="modern-payment-title">METHOD OF PAYMENT</div>
			<div class="modern-payment-line">${printText(document.tender ?? "Taken at the counter")}</div>
			${document.term ? `<div class="modern-payment-line">${printText(document.term)}</div>` : ""}
		${document.notes ? `<div class="modern-payment-line">${printText(document.notes)}</div>` : ""}
			${
        document.recurringSummary?.length
          ? `
				<div class="modern-recurring-title">RECURRING COMMITMENT</div>
				${modernTotals(document.recurringSummary, business)}
				${document.paymentNote ? `<div class="modern-payment-note">${printText(document.paymentNote)}</div>` : ""}
			`
          : ""
      }
		</div>
		${modernTotals(document.totals, business)}
	</div>
	${modernTerms(business)}
	<div class="modern-invoice-signature">
		<div>
			${document.signature ? `<img src="${printText(document.signature)}" alt="" onerror="this.style.display='none';" />` : ""}
			CUSTOMER SIGNATURE
		</div>
		<div>DATE</div>
	</div>`;

  return documentShell(
    document.kind === "RENTAL" ? "Rental Invoice" : "Invoice",
    body,
    business,
  );
};

export const buildPickupSlipHTML = (document: PosSaleDocument): string => {
  const { business } = document;
  const collectedAt = (business.addressLines ?? []).join(", ");
  const body = `
	${modernHeader({
    title: "PICKUP SLIP",
    business,
    number: document.number,
    date: document.date,
    numberLabel: numberLabel(document),
    dateLabel: "PICKUP DATE",
    dateValue: document.scheduledFor,
    soldTo: document.soldTo,
    shipTo: {
      label: "COLLECTED BY",
      name: "CUSTOMER PICKUP",
      lines: collectedAt ? [`Collected in store at ${collectedAt}.`] : [],
    },
  })}
	${modernSlipItems(document.items, "Awaiting Pickup", document.scheduledFor || "To be scheduled")}
	<div class="modern-balance">BALANCE OWING: ${printMoney(document.balance, business)}</div>
	${
    document.pickupCode
      ? `<div class="modern-agreement"><strong>PICKUP CODE: ${printText(document.pickupCode)}</strong> - show this code when you collect. Keep it private: it releases your order.</div>`
      : ""
  }
	${modernInstructions("RENTAL TERM", document.term)}
	${modernInstructions("PICKUP INSTRUCTIONS", document.pickupInstructions)}
	<div class="modern-acknowledgement">I acknowledge that I received all the products listed above safely and without any damage to my property.</div>
	${modernReceiptSignature()}
	<div class="modern-receipt-note">This slip is signed at the point of pickup. The signature captured at the point of sale is not reproduced here.</div>
	<div class="modern-thank-you">THANK YOU FOR SUPPORTING OUR BUSINESS, SEE YOU AGAIN</div>`;

  return documentShell("Pickup Slip", body, business);
};

export const buildDeliverySlipHTML = (document: PosSaleDocument): string => {
  const { business } = document;
  const stepCount = (count: number | null | undefined): string =>
    count === null || count === undefined
      ? '<span class="modern-fill-line"></span>'
      : `<strong>${printText(count)}</strong>`;
  const choice = (label: string, selected: boolean): string =>
    `<span class="modern-choice${selected ? " selected" : ""}">${printText(label)}</span>`;
  const yesNo = (answer: boolean | null | undefined): string =>
    `${choice("Yes", answer === true)}${choice("No", answer === false)}`;
  const body = `
	${modernHeader({
    title: "DELIVERY SLIP",
    business,
    number: document.number,
    date: document.date,
    numberLabel: numberLabel(document),
    dateLabel: "DELIVERY DATE",
    dateValue: document.scheduledFor,
    soldTo: document.soldTo,
    shipTo: {
      label: "DELIVER TO",
      name: document.shipTo.name,
      lines: document.shipTo.lines,
    },
  })}
	${modernSlipItems(document.items, "Scheduled", document.scheduledFor || "To be scheduled")}
	<div class="modern-balance">BALANCE OWING: ${printMoney(document.balance, business)}</div>
	<section class="modern-survey">
		<div class="modern-survey-panel">
			<div class="modern-section-label">SITE SURVEY</div>
			<div class="modern-survey-row">Steps Outside Home: ${stepCount(document.stepsOutside)}</div>
			<div class="modern-survey-row">Steps Inside Home: ${stepCount(document.stepsInside)}</div>
			<div class="modern-survey-row">Entrance Door: ${choice("Single", document.entranceDoor === "single")}${choice("Double", document.entranceDoor === "double")}</div>
			<div class="modern-survey-row">${choice("Ground Level", document.entranceLevel === "ground")}${choice("Upstairs", document.entranceLevel === "upstairs")}${choice("Basement", document.entranceLevel === "basement")}</div>
		</div>
		<div class="modern-survey-panel">
			<div class="modern-section-label">CHARGEABLE OPTIONS</div>
			<table class="modern-charge-table"><tbody>
				<tr><td>HOSES BOUGHT</td><td>${yesNo(document.hosesBought)}</td></tr>
				<tr><td>DOOR REMOVAL</td><td>${yesNo(document.doorRemoval)}</td></tr>
				<tr><td>DRYER VENT</td><td>${yesNo(document.dryerVent)}</td></tr>
			</tbody></table>
		</div>
	</section>
	${modernInstructions("RENTAL TERM", document.term)}
	${modernInstructions("DELIVERY INSTRUCTIONS", document.deliveryInstructions)}
	${modernInstructions("ORDER NOTE", document.notes)}
	<div class="modern-acknowledgement">I acknowledge that I received all the items listed above safely and without any damage to my property, and that I am completely satisfied with the delivery service.</div>
	${modernReceiptSignature()}
	<div class="modern-receipt-note">This slip is signed at the door on delivery. The signature captured at the point of sale is not reproduced here.</div>`;

  return documentShell("Delivery Slip", body, business);
};
