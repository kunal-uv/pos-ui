import type { PosTheme } from "./theme";

export type PosTenant = "appliance-outlet" | "rent-buddyz";

/**
 * The store behind the till, as its platform reports it. Printed on the slips.
 * Every field beyond the name is optional: a platform that does not hold a tax
 * registration number prints no registration row, rather than a blank one.
 */
export interface PosBusinessProfile {
  name: string;
  addressLines?: string[];
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  registrationLabel?: string | null;
  registrationNumber?: string | null;
  /** The store's own terms, printed verbatim on the invoice. */
  terms?: string | null;
}

export interface PosSession {
  tenantId: PosTenant;
  storeId: string;
  userId: string;
  displayName: string | null;
  currency: string;
  /** The combined rate the cart is priced with. */
  taxRate: number;
  /**
   * The same rate itemised as the store configured it (GST, PST, ...). Display
   * only: the cart's money is computed from `taxRate`. Absent or single-entry
   * means the till shows one combined tax line, as before.
   */
  taxes?: { name: string; rate: number }[];
  shippingFee?: number;
  business?: PosBusinessProfile | null;
  capabilities: {
    transactionKinds: Array<"SALE" | "RENTAL">;
    serializedInventory: boolean;
    rentalDates: boolean;
    securityDeposits: boolean;
    holds: boolean;
    splitPayments: boolean;
    signature: boolean;
    /** The New Customer form proves a new customer's email with an emailed code. */
    customerEmailVerification?: boolean;
    fulfilment: Array<"PICKUP" | "DELIVERY">;
  };
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  /** Drives the till's category rail. Null on a platform with no taxonomy. */
  category: { id: string; name: string } | null;
  availableCount: number;
  price: number;
  originalPrice: number | null;
  deposit: number;
  currency: string;
}

export interface InventoryUnit {
  id: string;
  productId: string;
  serial: string;
  status: string;
  price: number;
  originalPrice: number | null;
  deposit: number;
  /**
   * Whatever the platform knows about this individual unit. `grade` (A-D),
   * `gradeLabel` and `conditionNote` are the keys the picker reads; anything
   * else is carried into the order snapshot untouched.
   */
  metadata?: Record<string, unknown>;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** A warranty plan as the platform offers it with a product. */
export interface PosWarrantyPlan {
  id: string;
  title: string;
  kind: string;
  price: number;
  minPrice: number;
  maxPrice: number;
  durationMonths: number;
  terms: string | null;
}

export interface PosAddress {
  id?: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
}

export interface PosCart {
  id: string;
  kind: "SALE" | "RENTAL";
  customerId: string | null;
  /**
   * What the service recorded about the customer when they were chosen.
   * `taxExempt` / `taxExemptReason` are resolved by the platform on the server,
   * never taken from the till - this is where the till learns why no tax.
   */
  customerSnapshot?:
    | ({ taxExempt?: boolean; taxExemptReason?: string | null } & Record<
        string,
        unknown
      >)
    | null;
  currency: string;
  taxRate: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  feeTotal: number;
  shippingTotal: number;
  depositTotal: number;
  /**
   * A credit the platform already holds for this customer - the value of a
   * machine handed back over the counter - applied to this sale. Never more
   * than the sale is worth.
   */
  /** Extended warranty plans on the sale, taxed with it. */
  warrantyTotal?: number;
  creditTotal?: number;
  creditLabel?: string | null;
  creditReference?: string | null;
  grandTotal: number;
  fulfilment?: Record<string, unknown> | null;
  lines: Array<{
    id: string;
    name: string;
    sku: string | null;
    imageUrl?: string | null;
    serial: string | null;
    quantity: number;
    unitPrice: number;
    originalUnitPrice: number | null;
    discountAmount: number;
    feeAmount: number;
    depositAmount: number;
    taxAmount: number;
    lineTotal: number;
    rentalStart: string | null;
    rentalEnd: string | null;
    rentalTenure: number | null;
    /** The warranty plan sold with this line, and what it costs for the quantity. */
    warranty?: (PosWarrantyPlan & { total: number }) | null;
    /** Plans the product offers that apply at this line's rent. */
    availableWarranties?: PosWarrantyPlan[];
    /** `{ product, unit }` as the service snapshotted it when the line was priced. */
    metadata?: {
      product?: Record<string, unknown>;
      unit?: Record<string, unknown> | null;
      additionalNote?: string | null;
    } | null;
  }>;
  payments: Array<{ id: string; method: string; amount: number }>;
}

export interface SharedPosProps {
  apiUrl: string;
  tenant: PosTenant;
  storeId: string;
  token: string;
  onUnauthorized?: () => void;
  onCheckout?: (order: {
    orderId: string;
    number: string;
    externalOrderId: string;
  }) => void;
  /** Shows a "Dashboard" button in the till header. Omit and the header has no way out. */
  onExit?: () => void;
  brandName?: string;
  /**
   * Printed on the slips in place of the composed wordmark. A public path in
   * the host app, e.g. "/images/logo.png" - the print window is a new document
   * on the same origin, so a root-relative path resolves.
   */
  logoUrl?: string;
  /**
   * The host's own letterhead for the printed documents, merged over whatever
   * the platform's session reports, field by field.
   *
   * ! Appliance Outlet keeps its legal name, address, phone, UBI number and
   * ! sales terms in the admin (`constants/business_config.ts`), not in its API.
   * ! Without this the AO invoice was headed "APPLIANCE OUTLET POS" - the till's
   * ! title, set as a company name with "POS" in the brand colour - and carried
   * ! no address, phone or registration at all.
   */
  business?: Partial<PosBusinessProfile>;
  /**
   * Prefixed to a product image that is not already absolute. Platforms differ:
   * Rent Buddyz returns a bare filename to be resolved against its CDN, while
   * Appliance Outlet returns a full URL. Only the host knows which.
   */
  imageBaseUrl?: string;
  /** Browser-restricted key used for country-wide Google Places address verification. */
  googleMapsApiKey?: string;
  /**
   * Themes the whole till around one colour, for a platform with no preset of
   * its own. Each tenant already has one (see `theme.ts`), so this is only
   * needed to override it.
   */
  accentColor?: string;
  /** Token-level overrides, applied last. */
  theme?: Partial<PosTheme>;
  /**
   * Height already occupied by the host admin shell (for example its fixed
   * navbar). The till uses the remaining viewport so the browser page itself
   * never scrolls and the checkout action stays pinned.
   */
  viewportOffset?: number;
  /**
   * A credit the host wants spent on this sale, named by the platform's own
   * reference - Rent Buddy passes the counter return that issued it. The till
   * applies it to the open cart and asks the platform what it is worth; the
   * amount never comes from the browser.
   */
  creditReference?: string | null;
  /** Called once the credit has been applied, so the host can drop it from the URL. */
  onCreditApplied?: (reference: string) => void;
  /** Called when the credit cannot be applied, with the reason to show. */
  onCreditRejected?: (reference: string, reason: string) => void;
}
