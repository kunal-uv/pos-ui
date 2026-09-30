export { SharedPos } from "./shared-pos";
export { PosClient } from "./client";
export { PosSaleDocuments } from "./sale-documents";
export {
	buildDeliverySlipHTML,
	buildInvoiceHTML,
	buildPickupSlipHTML,
	type PosSaleDocument,
} from "./print/slips";
export { openPrintWindow, type PosBusiness } from "./print/document";
export {
	applianceOutletTheme,
	posLayout,
	rentBuddyzTheme,
	themeForTenant,
	themeFromAccent,
	type PosTheme,
} from "./theme";
export type * from "./types";
export { PosTill, setPosPlatform, type PosApi, type PosPlatform } from "./ao";
export type { BusinessConfig } from "./ao";
