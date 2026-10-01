"use client";

import React, { useState } from "react";
import { openPrintWindow } from "./print/document";
import { buildDeliverySlipHTML, buildInvoiceHTML, buildPickupSlipHTML, type PosSaleDocument } from "./print/slips";
import { uiFont, type PosTheme } from "./theme";

type DocType = "invoice" | "pickup_slip" | "delivery_slip";

interface DocumentRow {
	docType: DocType;
	title: string;
	description: string;
	/** True when this transaction is the kind that wants this document. */
	suggested: boolean;
}

/**
 * What to print once a transaction is done.
 *
 * ! Both slips are offered whatever the fulfilment, with the relevant one
 * ! marked. A delivery the customer decides to collect after all is a counter
 * ! conversation, not a reason to reopen the sale.
 *
 * ! This opens by itself the moment checkout commits - there is no completion
 * ! screen behind it any more. It is therefore the only place the new order
 * ! number is shown, which is why the header carries it: a number reachable
 * ! only inside a dismissed dialog is a number nobody can look up. Closing it
 * ! resets the till for the next customer.
 */
export const PosSaleDocuments = ({ document, theme, onClose }: {
	document: PosSaleDocument;
	theme: PosTheme;
	onClose: () => void;
}) => {
	const [blocked, setBlocked] = useState(false);

	const rows: DocumentRow[] = [
		{
			docType: "invoice",
			title: "Invoice",
			description: "The priced document the customer keeps.",
			suggested: true,
		},
		{
			docType: "pickup_slip",
			title: "Pickup slip",
			description: "Signed at the counter when the customer collects.",
			suggested: document.fulfilment === "pickup",
		},
		{
			docType: "delivery_slip",
			title: "Delivery slip",
			description: "Signed at the door when the item is dropped off.",
			suggested: document.fulfilment === "delivery",
		},
	];

	const print = (docType: DocType) => {
		const html =
			docType === "invoice"
				? buildInvoiceHTML(document)
				: docType === "pickup_slip"
					? buildPickupSlipHTML(document)
					: buildDeliverySlipHTML(document);
		setBlocked(!openPrintWindow(html));
	};

	return (
		<div role="dialog" aria-modal="true" aria-label="Transaction complete"
			style={{
				position: "fixed", inset: 0, background: "rgba(10,25,20,.44)",
				display: "grid", placeItems: "center", zIndex: 1200, padding: 16,
			}}>
			<div style={{
				width: "min(600px, 100%)", background: theme.surface, borderRadius: 18,
				border: `1px solid ${theme.borderSoft}`, boxShadow: "0 24px 60px rgba(16,22,20,.22)",
				display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 32px)", fontFamily: uiFont,
			}}>
				<div style={{ padding: "20px 22px 14px", borderBottom: `1px solid ${theme.borderSoft}` }}>
					<h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: theme.ink }}>
						Print documents
					</h2>
					<div style={{ marginTop: 4, fontSize: 13, color: theme.muted }}>
						{`${document.kind === "RENTAL" ? "Agreement" : "Invoice"} ${document.number}`}
					</div>
				</div>

				<div style={{ padding: 22, display: "grid", gap: 10, overflowY: "auto" }}>
					{blocked && (
						<div style={{
							padding: "9px 11px", borderRadius: 10, fontSize: 12.5,
							background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, color: theme.danger,
						}}>
							The print window was blocked. Allow pop-ups for this site, then print again.
						</div>
					)}

					{rows.map((row) => (
						<div key={row.docType} role="group" aria-label={row.title}
							style={{
								display: "flex", alignItems: "center", gap: 12, borderRadius: 15,
								padding: "12px 16px",
								border: `1.5px solid ${row.suggested ? theme.accent : theme.borderSoft}`,
								background: row.suggested ? theme.accentTint : theme.surface,
							}}>
							<div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
								<span style={{ fontSize: 15, fontWeight: 700, color: theme.ink }}>{row.title}</span>
								<span style={{ fontSize: 12.5, lineHeight: 1.35, color: theme.muted }}>{row.description}</span>
							</div>

							{row.suggested && (
								<span style={{
									flex: "none", borderRadius: 7, padding: "3px 8px", fontSize: 11, fontWeight: 800,
									background: theme.accentSoft, color: theme.accentDeep,
								}}>
									For this one
								</span>
							)}

							<button type="button" onClick={() => print(row.docType)}
								style={{
									display: "flex", alignItems: "center", justifyContent: "center", height: 38,
									flex: "none", borderRadius: 10, padding: "0 18px", cursor: "pointer",
									fontSize: 13.5, fontWeight: 700, fontFamily: uiFont,
									background: row.suggested ? theme.accent : theme.surfaceAlt,
									color: row.suggested ? "#fff" : theme.inkSoft,
									border: row.suggested ? "none" : `1.5px solid ${theme.border}`,
								}}>
								Print
							</button>
						</div>
					))}
				</div>

				<div style={{ display: "flex", justifyContent: "flex-end", padding: "0 22px 22px" }}>
					<button type="button" onClick={onClose}
						style={{
							height: 46, borderRadius: 13, padding: "0 22px", cursor: "pointer",
							border: `1px solid ${theme.border}`, background: theme.surface,
							color: theme.inkSoft, fontSize: 14.5, fontWeight: 700, fontFamily: uiFont,
						}}>
						Done
					</button>
				</div>
			</div>
		</div>
	);
};
