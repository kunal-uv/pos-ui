import { LocationModel, UserModel, CartModel, InvoiceModel } from "./";

/** One number a customer can be reached on, as the API hands it back. */
export interface CustomerPhoneModel {
	customer_phone_id?: string;
	phone: string;
	label?: string | null;
	is_primary?: boolean;
}

/** A reseller permit or exemption certificate held against a customer. */
export interface CustomerDocumentModel {
	customer_document_id: string;
	doc_type: "reseller_permit" | "tax_exemption" | "other";
	name: string;
	url: string;
	mime_type?: string | null;
	size_bytes?: string | number | null;
	created_at?: string | Date;
}

export interface CustomerModel {
	is_disabled: boolean;
	is_deleted: boolean;
	/**
	 * The blocked/"wanted" list - separate from `is_disabled`. A blocked
	 * customer is still active and visible everywhere; the flag only stops a
	 * new POS sale to them behind a manager-approval gate.
	 */
	is_blocked?: boolean;
	blocked_reason?: string | null;
	blocked_at?: string | Date | null;
	customer_id: string;
	/** Legacy single-field name, still written so old invoices reconcile. */
	name: string;
	/** Both print on the invoice; `name` is composed from them on save. */
	first_name?: string | null;
	last_name?: string | null;
	/** The number that prints - mirrors whichever `phones` row is primary. */
	phone: string;
	/** Every number, not just the primary one. */
	phones?: CustomerPhoneModel[];
	email?: string;
	/** Address line 1. */
	address?: string;
	/** Apartment, suite or unit. */
	address_line_2?: string;
	location_id?: string;
	location?: LocationModel;
	created_at?: Date;
	created_by_id?: string;
	created_by?: UserModel;
	updated_at?: Date;
	created_location_id?: string;
	created_location?: Location;
	/** Unticked by default, stamped with when and at which sale it was given. */
	marketing_consent?: boolean;
	marketing_consent_at?: string | Date | null;
	marketing_consent_invoice_id?: string | null;
	/** Wholesale / tax-exemption (§9, §14). Default retail on every existing row. */
	is_reseller?: boolean;
	reseller_permit_number?: string | null;
	is_tax_exempt?: boolean;
	tax_exempt_reason?: string | null;
	/** Reseller permits / exemption certificates on file. */
	documents?: CustomerDocumentModel[];
	carts: CartModel[];
	invoices: InvoiceModel[];
	state: string;
	city: string;
	pinCode: string;
}
