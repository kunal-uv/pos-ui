/**
 * Shim for AO's `containers/9_customers/add_customer_modal`: renders the
 * host's own customer form, registered through `setPosPlatform`.
 */
import React from "react";
import { requirePlatform } from "../../platform";

/** What the server stores, and what the detail endpoint hands back. */
export interface StoredPhone {
	phone: string;
	label?: string | null;
	is_primary?: boolean;
}

/** The props the till passes; the host's form may accept more. */
export interface AddCustomerModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSaved?: (customer: { customer_id: string; name: string }) => void;
	variant?: "dashboard" | "pos";
	[prop: string]: unknown;
}

const AddCustomerModal = (props: AddCustomerModalProps) => {
	const { AddCustomerModal: HostModal } = requirePlatform();
	return <HostModal {...props} />;
};

export default AddCustomerModal;
