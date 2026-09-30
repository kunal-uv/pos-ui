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
/**
 * ! The Appliance Outlet till is NOT re-exported here. It carries Mantine,
 * ! cookies-next and moment with it, and re-exporting pulled all of that into
 * ! every host that imports anything from this package - Rent Buddy's till
 * ! shipped a second copy of Mantine it never rendered. Import it by its own
 * ! path instead:
 * !
 * !     import { PosTill } from "@unlock-velocity/shared-pos-ui/ao";
 */
