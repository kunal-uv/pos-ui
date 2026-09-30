"use client";

import React from "react";
import {
	buildDeliverySlipHTML,
	buildInvoiceHTML,
	buildPickupSlipHTML,
	openPrintWindow,
} from "../../utils/print";
import {
	posPrintFulfilment,
	posPrintItems,
	posPrintMeta,
	posPrintTotals,
	type PosDocumentInvoice,
} from "../../utils/print/pos_documents";
import { posColor } from "./pos_design";
import { PosModal } from "./pos_ui";

export type SaleFulfilment = "delivery" | "pickup";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	invoiceId: string;
	grandTotal: string;
	/** Decides which slip is the one this sale actually needs. */
	fulfilment: SaleFulfilment;
	/**
	 * The sale, as `POST /pos/checkout` and `GET /report` both return it.
	 *
	 * ! Everything printed comes from here. When it is absent - an older payload
	 * ! carrying only the number and the total - the modal says so rather than
	 * ! printing a document with no line items on it.
	 */
	invoice?: PosDocumentInvoice | null;
}

type DocType = "invoice" | "delivery_slip" | "pickup_slip";

interface DocumentRow {
	docType: DocType;
	title: string;
	description: string;
	/** True when this sale is the kind that wants this document. */
	suggested: boolean;
}

/**
 * What to print once a sale is done (IB-04).
 *
 * ! **The Appliance Outlet workbook format.** These three documents are built by
 * ! `buildInvoiceHTML`, `buildDeliverySlipHTML` and `buildPickupSlipHTML` - the
 * ! forms the business actually hands customers, carrying its lockup, its
 * ! address block and its column layout. This modal first shipped printing
 * ! through `POST /invoice/:id/document` instead, which renders the seeded
 * ! `document_template` HTML: a generic starting layout, and not what anybody at
 * ! the counter recognised.
 *
 * ! The totals block is the sale's **stored breakup snapshot**, passed straight
 * ! through as `breakupRows`. A reprint therefore still shows the rows the sale
 * ! was actually charged - EHF, an older tax rate, an exchange credit - and the
 * ! printed invoice cannot disagree with the cart that produced it (Rule E, A48,
 * ! F-10).
 *
 * ! **This does not replace the invoice number in the cart footer** (CHK-22,
 * ! P22). That banner exists precisely because this modal can be dismissed, and
 * ! a sale whose number is only reachable inside a dismissed dialog is a sale
 * ! nobody can look up. The banner reopens this.
 *
 * ! Both slips are offered whatever the fulfilment, with the relevant one
 * ! marked. A delivery the customer decides to collect after all is a counter
 * ! conversation, not a reason to reopen the sale.
 */
export const PosSaleDocuments = ({
	isOpen,
	onClose,
	invoiceId,
	grandTotal,
	fulfilment,
	invoice = null,
}: Props) => {
	const documents: DocumentRow[] = [
		{
			docType: "invoice",
			title: "Invoice",
			description: "The priced document the customer keeps.",
			suggested: true,
		},
		{
			docType: "delivery_slip",
			title: "Delivery slip",
			description: "Signed at the door when the machine is dropped off.",
			suggested: fulfilment === "delivery",
		},
		{
			docType: "pickup_slip",
			title: "Pickup slip",
			description: "Signed at the counter when the customer collects.",
			suggested: fulfilment === "pickup",
		},
	];

	const print = (docType: DocType) => {
		if (!invoice) {
			return;
		}

		const meta = posPrintMeta(invoice);
		const totals = posPrintTotals(invoice);
		// The grade explains the price on the invoice, but it is not part of the
		// machine description used by the delivery and pickup teams.
		//
		// ! Each slip carries only the units going out that way. The invoice is
		// ! the bill for the whole order and lists everything.
		const items = posPrintItems(invoice, {
			includeGrade: docType === "invoice",
			...(docType === "delivery_slip"
				? { only: "delivery" as const }
				: docType === "pickup_slip"
					? { only: "pickup" as const }
					: {}),
		});

		if (docType === "invoice") {
			openPrintWindow(
				buildInvoiceHTML({
					meta,
					items,
					totals,
					note: invoice.delivery_note,
					// ! The signature taken before the invoice existed (CHK-34).
					// ! A slip gets a blank block instead and is signed on
					// ! receipt (P27, A53) - printing this one on a delivery slip
					// ! would be a receipt for a delivery nobody has made yet.
					...(invoice.signature_data
						? { customerSignature: invoice.signature_data }
						: {}),
				}),
			);

			return;
		}

		// The survey taken at the till, so the driver reads the answers rather
		// than an empty form.
		const details = posPrintFulfilment(invoice);

		openPrintWindow(
			docType === "delivery_slip"
				? buildDeliverySlipHTML({
						meta,
						items,
						details,
						balance: totals.balance,
					})
				: buildPickupSlipHTML({
						meta,
						items,
						details,
						balance: totals.balance,
					}),
		);
	};

	return (
		<PosModal
			opened={isOpen}
			onClose={onClose}
			size="lg"
			title="Sale complete"
			subtitle={`Invoice #${invoiceId} · ${grandTotal}`}
		>
			{!invoice && (
				<p className="text-[13px]" style={{ color: posColor.danger }}>
					This sale came back without its line items, so the documents
					cannot be printed here. Print them from Reports instead.
				</p>
			)}

			<div className="flex flex-col gap-[10px]">
				{documents.map((document) => (
					<div
						key={document.docType}
						role="group"
						aria-label={document.title}
						style={{
							border: `1.5px solid ${
								document.suggested
									? posColor.green
									: posColor.borderSoft
							}`,
							background: document.suggested
								? posColor.greenTint
								: posColor.surface,
						}}
						className="flex items-center gap-3 rounded-[15px] px-4 py-3"
					>
						<div className="flex min-w-0 flex-1 flex-col gap-[2px]">
							<span
								className="text-[15px] font-bold"
								style={{ color: posColor.ink }}
							>
								{document.title}
							</span>
							<span
								className="text-[12.5px] leading-[1.35]"
								style={{ color: posColor.muted }}
							>
								{document.description}
							</span>
						</div>

						{document.suggested && (
							<span
								className="flex-none rounded-[7px] px-[8px] py-[3px] text-[11px] font-extrabold"
								style={{
									background: posColor.greenSoft,
									color: posColor.greenDeep,
								}}
							>
								For this sale
							</span>
						)}

						<button
							type="button"
							disabled={!invoice}
							onClick={() => print(document.docType)}
							className="flex h-[38px] flex-none items-center justify-center rounded-[10px] px-4 text-[13.5px] font-bold transition-colors disabled:cursor-not-allowed"
							style={{
								background: invoice
									? document.suggested
										? posColor.green
										: posColor.surfaceAlt
									: posColor.surfaceMuted,
								color: invoice
									? document.suggested
										? "#FFFFFF"
										: posColor.inkSoft
									: posColor.mutedLight,
								border: document.suggested
									? "none"
									: `1.5px solid ${posColor.border}`,
							}}
						>
							Print
						</button>
					</div>
				))}
			</div>

			<div className="flex justify-end">
				<button
					type="button"
					onClick={onClose}
					className="flex h-[46px] items-center justify-center rounded-[13px] border px-5 text-[14.5px] font-bold transition-colors"
					style={{
						borderColor: posColor.border,
						background: posColor.surface,
						color: posColor.inkSoft,
					}}
				>
					Done
				</button>
			</div>
		</PosModal>
	);
};

export default PosSaleDocuments;
