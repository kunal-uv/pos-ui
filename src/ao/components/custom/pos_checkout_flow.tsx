"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
	GroupComponent,
	ModalComponent,
	SelectComponent,
	TextAreaInputComponent,
	TextInputComponent,
} from "../mantine";
import ShowNotification from "../mantine/show_notification";
import type { PosDocumentInvoice } from "../../utils/print";
import {
	captureSignatureApi,
	createCustomerAddressApi,
	getCustomerAddressesApi,
	getCustomerApi,
	getPosCartApi,
	formatPhone,
	isValidPostal,
	POSTAL_FORMAT_MESSAGE,
	logoutUser,
	posCheckoutApi,
	updatePosCartApi,
} from "../../utils";
import { posFooterButton } from "./pos_ui";
import { AddressAutocompleteField } from "./address_autocomplete";
import {
	dominantTenderType,
	PosPaymentTenders,
	tenderPayload,
	type Tender,
} from "./pos_payment_tenders";
import {
	DEFAULT_MARKETING_CONSENT,
	DigitalSignatureModal,
} from "./digital_signature";
import AddCustomerModal, {
	type StoredPhone,
} from "../../containers/9_customers/add_customer_modal";

/**
 * The five payment types §7.5 allows, in its order (P17, A40, CHK-14).
 *
 * ! Exactly these. Visa, Master Card, Amex and Cheque are not options - they are
 * ! migrated to Credit and Certified Check by migration 011, with the original
 * ! string kept on the invoice and in the audit log.
 */
const PAYMENT_TYPES = [
	{ id: "cash", value: "cash", label: "Cash" },
	{ id: "debit", value: "debit", label: "Debit" },
	{ id: "credit", value: "credit", label: "Credit" },
	{ id: "zelle", value: "zelle", label: "Zelle" },
	{
		id: "certified_check",
		value: "certified_check",
		label: "Certified Cheque / Draft",
	},
];

const parseStepCount = (value: string): number | null => {
	if (value === "") return null;

	const parsed = Number(value);

	return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
};

type Step = "customer" | "shipping" | "details" | "signature" | "payment";

/**
 * The steps, in the one order §7 allows them (D17).
 *
 * ! `details` sits AFTER shipping and before the signature. It has to follow
 * ! shipping because what it asks depends on which methods the order carries,
 * ! and it has to precede the signature because the customer is signing for a
 * ! delivery on a date they were told.
 */
const STEPS: Array<{ key: Step; label: string }> = [
	{ key: "customer", label: "Customer" },
	{ key: "shipping", label: "Shipping" },
	{ key: "details", label: "Details" },
	{ key: "signature", label: "Signature" },
	{ key: "payment", label: "Payment" },
];

interface SavedAddress {
	customer_address_id: string;
	street: string | null;
	city: string | null;
	region: string | null;
	postal: string;
	label: string | null;
}

/** What the customer list hands back, as the picker and the edit form need it. */
interface PickedCustomer {
	customer_id: string;
	name: string;
	first_name?: string | null;
	last_name?: string | null;
	phone?: string;
	phones?: Array<StoredPhone>;
	email?: string;
	address?: string;
	address_line_2?: string;
	city?: string;
	state?: string;
	pinCode?: string;
}

interface Props {
	isOpen: boolean;
	onClose: () => void;
	cartId: string;
	/** Cash/card/etc. still due after an exchange credit, in minor units. */
	amountDueMinor: number;
	/** Credit left over when the returned item was worth more than its replacement. */
	unusedExchangeCreditMinor?: number;
	/**
	 * §8.4. Set when this cart is a layaway's agreement. Its money was taken on
	 * the Layaways screen and is already on the cart, so the payment step shows
	 * that ledger instead of taking tenders - and sends the ledger back as it
	 * is, which is the only tender list the API accepts for a layaway cart.
	 */
	layaway?: {
		layaway_no: string;
		original_amount: string;
		paid_amount: string;
		payments: Array<{ payment_type: string; amount: string }>;
	} | null;
	/**
	 * ! Fired the moment this flow writes a new customer onto the cart. The Order
	 * ! panel behind the modal prices tax from the cart's customer (§9, §14), so
	 * ! attaching a reseller / tax-exempt customer - or swapping back to a retail
	 * ! one - has to re-run that breakup, or the till keeps showing the last
	 * ! customer's tax standing against this sale.
	 */
	onCustomerChanged?: () => void;
	/**
	 * ! `fulfilment` travels with the invoice so the caller can offer the right
	 * ! slip without asking the server again. Normalised to the two the sale
	 * ! actually has - "same as billing" and "a different address" are both
	 * ! deliveries; only the shipping step cares about the distinction.
	 */
	onCompleted: (invoice: {
		invoice_id: string;
		grand_total: string;
		fulfilment: "delivery" | "pickup";
		/**
		 * ! The sale itself, for the printed documents. The Appliance Outlet
		 * ! invoice and slips are built in the browser and need the serials, the
		 * ! model names and the stored breakup - none of which a number and a
		 * ! total carry.
		 */
		document?: PosDocumentInvoice | null;
	}) => void;
}

// The till's own footer pair, shared with every other POS modal rather than
// re-typed here.
const primaryButton = posFooterButton.primary;
const secondaryButton = posFooterButton.secondary;

/**
 * Checkout, in the order §7 puts it (CHK-16 … CHK-19, CHK-33, CHK-34).
 *
 * ! **The order is the point.** cart → shipping → signature → invoice. The live
 * ! build created the invoice first and opened the signature pad afterwards, so
 * ! a success toast fired over a blank pad and an invoice existed for a sale
 * ! nobody had signed for (D17, A55). The server refuses out-of-order too; this
 * ! screen simply cannot ask for them out of order.
 *
 * ! **Checkout opens the shipping step; it never throws** (P18, A42, D23). The
 * ! old build answered "Please select shipping address first!" and stopped,
 * ! which meant a walk-in collecting in store could not be served at all.
 */
export const PosCheckoutFlow = ({
	isOpen,
	onClose,
	cartId,
	amountDueMinor,
	unusedExchangeCreditMinor = 0,
	layaway = null,
	onCompleted,
	onCustomerChanged,
}: Props) => {
	const router = useRouter();
	const [step, setStep] = useState<Step>("customer");
	const [busy, setBusy] = useState(false);

	/** Controlled so the picker can be reopened on the whole list - see below. */
	const [customerSearch, setCustomerSearch] = useState("");
	/**
	 * The selected customer's label, kept apart from `customers`.
	 *
	 * ! That list is one page of server results and need not contain the person
	 * ! already on the cart, so it cannot be relied on to put the name back in
	 * ! the box when the picker closes.
	 */
	const [customerLabel, setCustomerLabel] = useState("");
	const [customers, setCustomers] = useState<
		{
			id: string;
			label: string;
			billing: SavedAddress | null;
			/** Kept whole so the edit form can open on it without another fetch. */
			record: PickedCustomer;
		}[]
	>([]);
	const [customerId, setCustomerId] = useState<string>("");
	const [exchangeFromInvoiceId, setExchangeFromInvoiceId] = useState("");
	const [customerModal, setCustomerModal] = useState(false);
	/** `edit` reopens the form on the chosen customer; `new` starts an empty one. */
	const [customerMode, setCustomerMode] = useState<"new" | "edit">("new");
	const [callApi, setCallApi] = useState(false);

	/**
	 * The cart's lines, so each can be given its own method.
	 *
	 * ! Fetched here rather than passed in. The step needs the serial and the
	 * ! product name to make "which of these is being collected?" answerable,
	 * ! and the caller only ever had the cart id.
	 */
	const [lines, setLines] = useState<
		{
			cart_draft_line_id: string;
			serial: string;
			fulfilment: "delivery" | "pickup" | null;
			product?: { name?: string } | null;
		}[]
	>([]);

	const [fulfilment, setFulfilment] = useState<
		"same_as_billing" | "pickup" | "different"
	>("same_as_billing");
	const [addresses, setAddresses] = useState<SavedAddress[]>([]);
	const [addressId, setAddressId] = useState<string>("");
	const [newAddress, setNewAddress] = useState({
		street: "",
		city: "",
		region: "",
		postal: "",
	});

	const [signatureOpen, setSignatureOpen] = useState(false);
	const [signedAt, setSignedAt] = useState<string | null>(null);
	const [consent, setConsent] = useState(DEFAULT_MARKETING_CONSENT);
	const [paymentType, setPaymentType] = useState<string>("");

	/**
	 * The tenders taken at the till (§7.5).
	 *
	 * ! Amounts are held as the strings the operator typed, not as numbers. A
	 * ! half-typed "1." or an empty box is a normal state mid-keystroke, and
	 * ! coercing every change to a number turns "" into 0 and fights the cursor.
	 */
	const [tenders, setTenders] = useState<Array<Tender>>([]);

	/**
	 * How the sale is recorded as paid.
	 *
	 * ! The PAYMENT TYPE grid and the split-payment rows ask the same question,
	 * ! and a salesperson who has just keyed "$200 cash, $200 credit" has
	 * ! answered it - twice. Requiring the grid on top of that left Complete
	 * ! sale greyed out with nothing on screen saying which of the two
	 * ! identical-looking questions was still outstanding, and the only way
	 * ! forward was to pick a single method that contradicted the split below
	 * ! it.
	 *
	 * ! So the tenders answer it, by the same largest-wins rule the server uses
	 * ! when it writes `invoice.payment_type` from them. An explicit tap on the
	 * ! grid still wins - it is the more specific instruction, and it is how a
	 * ! sale with a balance owing and nothing tendered yet gets a method at all.
	 */
	const effectivePaymentType = paymentType || dominantTenderType(tenders);

	/**
	 * The customer list behind the picker.
	 *
	 * ! Searched on the server, not filtered in the browser. This asked for
	 * ! `/customers` with no query at all, which the API answers with its
	 * ! default first page - fifteen rows. Anybody outside those fifteen simply
	 * ! could not be picked at the till, and a cart whose customer was not among
	 * ! them showed an empty box.
	 */
	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const term = customerSearch.trim();
		// `q` is the API's one-box lookup and wants two characters; below that
		// the first page is the right answer.
		const query = term.length >= 2
			? `q=${encodeURIComponent(term)}&pageSize=50`
			: "pageSize=50";
		const timer = window.setTimeout(() => {
		getCustomerApi(
			query,
			(data: { customers: PickedCustomer[] }) =>
				setCustomers(
					(data.customers ?? []).map((customer) => ({
						id: String(customer.customer_id),
						label: `${customer.name} · ${formatPhone(customer.phone)}`.trim(),
						// The billing address, only when it carries the one
						// field that makes it usable as a ship-to.
						billing: customer.pinCode
							? {
									customer_address_id: "",
									street: customer.address ?? null,
									city: customer.city ?? null,
									region: customer.state ?? null,
									postal: customer.pinCode,
									label: "Billing address",
								}
							: null,
						record: customer,
					})),
				),
			() => {},
			() => logoutUser(router),
		).then();
		}, 250);

		return () => window.clearTimeout(timer);
	}, [isOpen, callApi, router, customerSearch]);

	useEffect(() => {
		if (!isOpen) return;

		getPosCartApi(
			(data: {
				cart?: {
					lines?: typeof lines;
					customer?: { customer_id?: string | number } | null;
					exchange_from_invoice_id?: string | null;
				};
			}) => {
				setLines(data.cart?.lines ?? []);
				setExchangeFromInvoiceId(
					data.cart?.exchange_from_invoice_id ?? "",
				);

				if (data.cart?.customer?.customer_id) {
					setCustomerId(String(data.cart.customer.customer_id));
				}
			},
			() => {},
			() => logoutUser(router),
		).then();
	}, [isOpen, router]);

	/**
	 * ! Falls back to the order default rather than assuming delivery. A line
	 * ! that has never been touched follows whatever the order says, and that is
	 * ! what the server will store for it too - the two have to agree or the
	 * ! screen shows one thing and the invoice records another.
	 */
	const lineMethod = (line: (typeof lines)[number]): "delivery" | "pickup" =>
		line.fulfilment ?? (fulfilment === "pickup" ? "pickup" : "delivery");

	const setLineMethod = (id: string, method: "delivery" | "pickup") => {
		setLines((current) =>
			current.map((line) =>
				line.cart_draft_line_id === id
					? { ...line, fulfilment: method }
					: line,
			),
		);
	};

	/**
	 * ! The lines arrive from a fetch made when the modal opens. Until it lands -
	 * ! or if it fails - the list is empty, and "no line is delivered" hid the
	 * ! whole delivery survey: the cashier saw a bare note field and the order
	 * ! was saved without its date, steps or instructions, so the delivery slip
	 * ! printed blank. With no lines to go on, the order's own choice decides.
	 */
	const anyDelivered =
		lines.length > 0
			? lines.some((line) => lineMethod(line) === "delivery")
			: fulfilment !== "pickup";
	const anyCollected =
		lines.length > 0
			? lines.some((line) => lineMethod(line) === "pickup")
			: fulfilment === "pickup";

	/**
	 * The fulfilment survey (§7.4, the delivery slip's own form).
	 *
	 * ! Held as one object so the whole tab saves in a single PATCH. Sending a
	 * ! field per keystroke would put a write on the wire for every digit of a
	 * ! step count.
	 */
	const [details, setDetails] = useState<{
		delivery_date: string;
		pickup_date: string;
		delivery_instructions: string;
		pickup_instructions: string;
		/** Exact counts for the crew and the printed delivery slip. */
		steps_outside: number | null;
		steps_inside: number | null;
		entrance_door: "" | "single" | "double";
		entrance_level: "" | "ground" | "upstairs" | "basement";
		hoses_bought: boolean | null;
		door_removal: boolean | null;
		dryer_vent: boolean | null;
		/** Order-level, not delivery/pickup-specific - prints as the invoice's delivery note. */
		order_note: string;
	}>({
		delivery_date: "",
		pickup_date: "",
		delivery_instructions: "",
		pickup_instructions: "",
		steps_outside: null,
		steps_inside: null,
		entrance_door: "",
		entrance_level: "",
		hoses_bought: null,
		door_removal: null,
		dryer_vent: null,
		order_note: "",
	});

	const setDetail = <K extends keyof typeof details>(
		key: K,
		value: (typeof details)[K],
	) => setDetails((current) => ({ ...current, [key]: value }));

	const loadAddresses = useCallback(
		(id: string) => {
			if (!id) {
				setAddresses([]);

				return;
			}

			getCustomerAddressesApi(
				id,
				(data: { addresses: SavedAddress[] }) =>
					setAddresses(data.addresses ?? []),
				() => {},
				() => logoutUser(router),
			).then();
		},
		[router],
	);

	useEffect(() => {
		loadAddresses(customerId);
	}, [customerId, loadAddresses]);

	/**
	 * Keeps the remembered label in step with whoever is selected - including a
	 * customer the cart already carried, who is only nameable once the list has
	 * arrived.
	 *
	 * ! Sets the label and nothing else. Writing `customerSearch` here would
	 * ! undo the reset on open: the list would reload, this would recognise the
	 * ! selected customer in it, and the box would filter straight back down to
	 * ! them.
	 */
	useEffect(() => {
		if (!customerId) {
			setCustomerLabel("");

			return;
		}

		const found = customers.find((entry) => entry.id === customerId);

		if (found) {
			setCustomerLabel(found.label);
		}
	}, [customerId, customers]);

	const chosen = customers.find((entry) => entry.id === customerId);
	// P20 / A43: disabled with a reason when the customer has no billing address
	// to copy, rather than silently doing nothing.
	const canCopyBilling = Boolean(chosen?.billing?.postal);

	// Undefined when the form is being opened for somebody new, which is what
	// makes the same modal serve both buttons.
	const editing = customerMode === "edit" ? chosen?.record : undefined;

	const patchCart = async (body: Record<string, unknown>) =>
		new Promise<boolean>((resolve) => {
			updatePosCartApi(
				cartId,
				body,
				() => resolve(true),
				(message: string) => {
					ShowNotification(message, "error");
					resolve(false);
				},
				() => logoutUser(router),
			).then();
		});

	const handleCustomerNext = async () => {
		if (!customerId) {
			ShowNotification("Choose a customer first", "error");

			return;
		}

		setBusy(true);
		const ok = await patchCart({ customer_id: customerId });
		setBusy(false);

		if (ok) {
			// ! The cart now belongs to a different customer; the Order panel
			// ! has to re-price so its Sales Tax row reflects this customer's
			// ! standing, not whoever was on the cart a moment ago.
			onCustomerChanged?.();
			setStep("shipping");
		}
	};

	/**
	 * The per-line choices, in the shape the server takes.
	 *
	 * ! Every line is sent, including the ones nobody touched, and each carries
	 * ! the method the screen was showing. A line left implicit would be stored
	 * ! against the order default, and the operator would have agreed to
	 * ! something the screen never displayed.
	 */
	const lineFulfilmentPayload = () =>
		lines.map((line) => ({
			cart_draft_line_id: line.cart_draft_line_id,
			fulfilment: lineMethod(line),
		}));

	/**
	 * Saves the survey and moves on.
	 *
	 * ! Only the half that applies is sent. A pure pickup order must not write a
	 * ! delivery date, and an operator who filled the delivery side in before
	 * ! switching every line to pickup should not have that stale answer follow
	 * ! the sale onto a slip nobody will read.
	 *
	 * ! Nothing here is required. D23 is the standing reminder that a mandatory
	 * ! fulfilment field is what stops a sale that should take thirty seconds.
	 */
	const handleDetailsNext = async () => {
		setBusy(true);

		const ok = await patchCart({
			...(anyDelivered
				? {
						delivery_date: details.delivery_date || null,
						delivery_instructions:
							details.delivery_instructions.trim() || null,
						steps_outside: details.steps_outside,
						steps_inside: details.steps_inside,
						entrance_door: details.entrance_door || null,
						entrance_level: details.entrance_level || null,
						hoses_bought: details.hoses_bought,
						door_removal: details.door_removal,
						dryer_vent: details.dryer_vent,
					}
				: {}),
			...(anyCollected
				? {
						pickup_date: details.pickup_date || null,
						pickup_instructions:
							details.pickup_instructions.trim() || null,
					}
				: {}),
			// Order-level, so it goes regardless of how the order is fulfilled.
			order_note: details.order_note.trim() || null,
		});

		setBusy(false);

		if (ok) {
			setStep("signature");
		}
	};

	const handleShippingNext = async () => {
		setBusy(true);

		// P21 / A44 / D23: pickup needs no address at all, and that is the
		// whole point of the option.
		//
		// ! Only when nothing on the order is being delivered. A mixed order
		// ! still has to go somewhere, so it takes the address path below.
		if (fulfilment === "pickup" && !anyDelivered) {
			const ok = await patchCart({
				fulfilment: "pickup",
				ship_address_id: null,
				line_fulfilment: lineFulfilmentPayload(),
			});

			setBusy(false);

			if (ok) {
				setStep("details");
			}

			return;
		}

		let chosenAddressId = addressId;

		// "Same as Billing Address" copies the billing address in one click
		// (P20, A43) by saving it as a ship-to the customer can reuse.
		if (fulfilment === "same_as_billing" && chosen?.billing) {
			chosenAddressId = await new Promise<string>((resolve) => {
				createCustomerAddressApi(
					customerId,
					{
						street: chosen.billing?.street ?? undefined,
						city: chosen.billing?.city ?? undefined,
						region: chosen.billing?.region ?? undefined,
						postal: chosen.billing?.postal ?? "",
						label: "Same as billing",
					},
					(data: { address: { customer_address_id: string } }) =>
						resolve(data.address.customer_address_id),
					(message: string) => {
						ShowNotification(message, "error");
						resolve("");
					},
					() => logoutUser(router),
				).then();
			});
		}

		if (fulfilment === "different" && !chosenAddressId) {
			if (!isValidPostal(newAddress.postal)) {
				setBusy(false);
				ShowNotification(POSTAL_FORMAT_MESSAGE, "error");

				return;
			}

			chosenAddressId = await new Promise<string>((resolve) => {
				createCustomerAddressApi(
					customerId,
					newAddress,
					(data: { address: { customer_address_id: string } }) =>
						resolve(data.address.customer_address_id),
					(message: string) => {
						ShowNotification(message, "error");
						resolve("");
					},
					() => logoutUser(router),
				).then();
			});
		}

		if (!chosenAddressId) {
			setBusy(false);
			ShowNotification("Choose or enter a delivery address", "error");

			return;
		}

		const ok = await patchCart({
			fulfilment: "delivery",
			ship_address_id: chosenAddressId,
			line_fulfilment: lineFulfilmentPayload(),
		});

		setBusy(false);

		if (ok) {
			setStep("details");
		}
	};

	/**
	 * ! The signature is sent to the server **before** any invoice exists, and
	 * ! consent goes with it because the checkbox sits directly above the pad.
	 */
	const handleSignature = async (signature: string) => {
		setBusy(true);

		await captureSignatureApi(
			cartId,
			{ signature_data: signature, marketing_consent: consent },
			(data: { captured_at: string }) => {
				setBusy(false);
				setSignedAt(data.captured_at);
				setSignatureOpen(false);
				setStep("payment");
			},
			(message: string) => {
				setBusy(false);
				ShowNotification(message, "error");
			},
			() => logoutUser(router),
		);
	};

	const handleCheckout = async () => {
		// ! A layaway checks out on its own ledger: nothing is tendered here, and
		// ! the largest payment already taken is the one the invoice records.
		const layawayType = layaway
			? ([...layaway.payments].sort(
					(left, right) => Number(right.amount) - Number(left.amount),
				)[0]?.payment_type ?? "")
			: "";
		const paymentRequired = !layaway && amountDueMinor > 0;

		if (paymentRequired && !effectivePaymentType) {
			ShowNotification("Choose how the customer is paying", "error");

			return;
		}

		setBusy(true);

		// ! The tenders go with the payment type, in one write. Two calls would
		// ! leave a window where the cart carries a type and no payments, and a
		// ! checkout landing in it would read the sale as paid in full.
		const ok = await patchCart(
			layaway
				? {
						payment_type: layawayType || null,
						payments: layaway.payments,
					}
				: {
						payment_type: paymentRequired
							? effectivePaymentType
							: null,
						payments: paymentRequired ? tenderPayload(tenders) : [],
					},
		);

		if (!ok) {
			setBusy(false);

			return;
		}

		await posCheckoutApi(
			{
				cart_draft_id: cartId,
				...(layaway
					? layawayType
						? { payment_method: layawayType }
						: {}
					: paymentRequired
						? { payment_method: effectivePaymentType }
						: {}),
			},
			(data: {
				invoice: { invoice_id: string; grand_total: string };
				document?: PosDocumentInvoice | null;
			}) => {
				setBusy(false);
				onCompleted({
					...data.invoice,
					// Only pickup is not a delivery; the other two shipping
					// choices differ in where it goes, not in how.
					fulfilment: fulfilment === "pickup" ? "pickup" : "delivery",
					document: data.document ?? null,
				});
				onClose();
			},
			(message: string) => {
				setBusy(false);
				ShowNotification(message, "error");
			},
			() => logoutUser(router),
		);
	};

	const stepIndex = STEPS.findIndex((entry) => entry.key === step);

	return (
		<ModalComponent
			opened={isOpen}
			onClose={onClose}
			size="lg"
			radius={22}
			/**
			 * ! A click that lands beside the modal must not throw the checkout
			 * ! away. By the payment step the customer has already signed and
			 * ! `captureSignatureApi` has written that to the server, so a stray
			 * ! click discards a signature that was actually taken and sends the
			 * ! salesperson back through four steps to retake it.
			 *
			 * ! Escape still closes it. That one is deliberate and reachable
			 * ! only on purpose; the Cancel path stays available either way.
			 */
			closeOnClickOutside={false}
			title={
				<div className="flex flex-col gap-[3px]">
					<span className="text-[21px] font-extrabold tracking-[-0.02em] text-[#101614]">
						Checkout
					</span>
					<span className="text-[13.5px] text-[#6B7A74]">
						Customer → Shipping → Signature → Invoice
					</span>
				</div>
			}
		>
			<div className="flex flex-col gap-[14px] font-manrope">
				{/* The sequence is drawn because it is enforced: the server
				    refuses these out of order, and a salesperson stuck on a step
				    should be able to see which one and why (D17). */}
				<ol className="flex list-none items-center gap-[6px] p-0">
					{STEPS.map((entry, index) => {
						const done = index < stepIndex;
						const current = index === stepIndex;

						return (
							<li
								key={entry.key}
								className={`flex h-[38px] flex-1 items-center justify-center gap-[7px] rounded-[11px] border text-[13px] font-bold ${
									current
										? "border-[#0F6B37] bg-[#0F6B37] text-white"
										: done
											? "border-[#BFE3CD] bg-[#E7F2EB] text-[#0B4A2A]"
											: "border-[#E6EBE8] bg-white text-[#8A968F]"
								}`}
							>
								<span
									className={`grid h-[20px] w-[20px] place-items-center rounded-full text-[11px] font-extrabold ${
										current
											? "bg-white/20 text-white"
											: done
												? "bg-[#0F6B37] text-white"
												: "bg-[#EDF1EF] text-[#8A968F]"
									}`}
								>
									{done ? "✓" : index + 1}
								</span>
								{entry.label}
							</li>
						);
					})}
				</ol>

				{step === "customer" && (
					<div className="flex flex-col gap-[12px]">
						<SelectComponent
							searchable
							label="Customer"
							disabled={Boolean(exchangeFromInvoiceId)}
							placeholder="Search by name or phone"
							value={customerId}
							setValue={setCustomerId}
							searchValue={customerSearch}
							onSearchChange={setCustomerSearch}
							setOption={(option) => setCustomerLabel(option.label)}
							onDropdownClose={() => setCustomerSearch(customerLabel)}
							/**
							 * ! Reopening the picker clears the box. Mantine seeds
							 * ! the search with the selected option's label and
							 * ! never resets it, so a second visit to this step
							 * ! filtered the list down to the customer already on
							 * ! the cart - the operator saw one row, the one they
							 * ! were trying to move away from, and concluded the
							 * ! customer could not be changed.
							 */
							onDropdownOpen={() => setCustomerSearch("")}
							data={customers.map((customer) => ({
								id: customer.id,
								value: customer.id,
								label: customer.label,
							}))}
						/>
						<div className="flex gap-[10px]">
							<button
								type="button"
								className={secondaryButton}
								disabled={Boolean(exchangeFromInvoiceId)}
								onClick={() => {
									setCustomerMode("new");
									setCustomerModal(true);
								}}
							>
								New Customer
							</button>
							{/* ! The till is where a second number actually gets
							    given - somebody reads it out at the counter
							    while the sale is being rung up. Sending the
							    salesperson to the Customers page to add it and
							    back again is how it ends up in the notes field
							    instead. */}
							<button
								type="button"
								className={secondaryButton}
								disabled={busy || !customerId}
								onClick={() => {
									setCustomerMode("edit");
									setCustomerModal(true);
								}}
							>
								Edit Customer
							</button>
							<button
								type="button"
								className={primaryButton}
								disabled={busy || !customerId}
								onClick={handleCustomerNext}
							>
								Continue
							</button>
						</div>
					</div>
				)}

				{step === "shipping" && (
					<div className="flex flex-col gap-[12px]">
						{/* ! Per line, because one order may mix them: the
						    ! customer takes the microwave today and has the
						    ! fridge delivered on Thursday. The choices below
						    ! are the order's default and where it ships TO;
						    ! these say which machines are going there. */}
						{lines.length > 1 && (
							<div className="flex flex-col gap-[8px] rounded-[15px] border-[1.5px] border-[#E6EBE8] p-4">
								<span className="text-[13px] font-semibold text-[#101614]">
									How is each item going out?
								</span>
								{lines.map((line) => {
									const method = lineMethod(line);

									return (
										<div
											key={line.cart_draft_line_id}
											className="flex items-center justify-between gap-3"
										>
											<span className="min-w-0 flex-1 truncate text-[13px] text-[#3C4A42]">
												{line.product?.name ??
													line.serial}
												<span className="ml-2 text-[#8A9690]">
													{line.serial}
												</span>
											</span>
											<div className="flex shrink-0 gap-[6px]">
												{(
													[
														"delivery",
														"pickup",
													] as const
												).map((option) => (
													<button
														key={option}
														type="button"
														aria-pressed={
															method === option
														}
														onClick={() =>
															setLineMethod(
																line.cart_draft_line_id,
																option,
															)
														}
														className={`rounded-[10px] border-[1.5px] px-3 py-1 text-[12px] font-semibold transition-colors ${
															method === option
																? "border-[#0F6B37] bg-[#F3F9F5] text-[#0F6B37]"
																: "border-[#E6EBE8] bg-white text-[#6B7770] hover:border-[#0F6B37]"
														}`}
													>
														{option === "pickup"
															? "Pickup"
															: "Delivery"}
													</button>
												))}
											</div>
										</div>
									);
								})}
							</div>
						)}

						{/* P18 / P20 / P21, Mockup 12. Three choices, and one of
						    them needs no address at all. */}
						<div className="flex flex-col gap-[8px]">
							{[
								{
									key: "same_as_billing" as const,
									label: canCopyBilling
										? "Same as Billing Address"
										: "Same as Billing Address",
									hint: canCopyBilling
										? "Copies the address on file and saves it as a ship-to."
										: "This customer has no billing address on file.",
									disabled: !canCopyBilling,
								},
								{
									key: "pickup" as const,
									label: "Order Pickup by Customer",
									hint: "No address needed. The invoice shows Customer Pickup and a pickup slip prints instead of a delivery slip.",
									disabled: false,
								},
								{
									key: "different" as const,
									label: "Ship to a different address",
									hint: "Choose one this customer has used before, or enter a new one.",
									disabled: false,
								},
							].map((option) => {
								const on = fulfilment === option.key;

								return (
									<button
										type="button"
										key={option.key}
										disabled={option.disabled}
										aria-pressed={on}
										onClick={() =>
											setFulfilment(option.key)
										}
										className={`flex items-start gap-3 rounded-[15px] border-[1.5px] p-4 text-left transition-colors disabled:opacity-60 ${
											on
												? "border-[#0F6B37] bg-[#F3F9F5]"
												: "border-[#E6EBE8] bg-white hover:border-[#0F6B37] hover:bg-[#F7FAF8]"
										}`}
									>
										<span
											className={`mt-[2px] grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-[1.5px] text-[13px] font-extrabold ${
												on
													? "border-[#0F6B37] bg-[#0F6B37] text-white"
													: "border-[#DFE6E2] bg-white text-transparent"
											}`}
										>
											✓
										</span>
										<span className="flex min-w-0 flex-col gap-[3px]">
											<span className="text-[15px] font-bold text-[#101614]">
												{option.label}
											</span>
											<span className="text-[13px] leading-[1.4] text-[#6B7A74]">
												{option.hint}
											</span>
										</span>
									</button>
								);
							})}
						</div>

						{fulfilment === "different" && (
							<div className="flex flex-col gap-[10px]">
								{addresses.length > 0 && (
									<SelectComponent
										label="Use a saved address"
										placeholder="Previously used"
										value={addressId}
										setValue={setAddressId}
										data={addresses.map((address) => ({
											id: address.customer_address_id,
											value: address.customer_address_id,
											label: [
												address.street,
												address.city,
												address.postal,
											]
												.filter(Boolean)
												.join(", "),
										}))}
									/>
								)}

								{!addressId && (
									<>
										<AddressAutocompleteField
											id="checkout-ship-street"
											label="Address"
											value={newAddress.street}
											onChange={(value) =>
												setNewAddress((previous) => ({
													...previous,
													street: value,
												}))
											}
											/**
											 * ! City, State and ZIP come from
											 * ! the row the operator chose, and
											 * ! only from it. `|| previous`
											 * ! everywhere but the street: a
											 * ! point with no postcode must not
											 * ! wipe a ZIP already typed, and
											 * ! must not invent one - the guard
											 * ! below refuses to continue
											 * ! without a valid ZIP, and a
											 * ! plausible wrong one would sail
											 * ! straight past it onto a van.
											 */
											onPick={(suggestion) =>
												setNewAddress((previous) => ({
													...previous,
													street: suggestion.street,
													city:
														suggestion.city ||
														previous.city,
													region:
														suggestion.region ||
														previous.region,
													postal:
														suggestion.postal ||
														previous.postal,
												}))
											}
										/>
										<div className="grid grid-cols-3 gap-[10px]">
											<TextInputComponent
												label="City"
												value={newAddress.city}
												setValue={(value: string) =>
													setNewAddress(
														(previous) => ({
															...previous,
															city: value,
														}),
													)
												}
											/>
											<TextInputComponent
												label="State"
												value={newAddress.region}
												setValue={(value: string) =>
													setNewAddress(
														(previous) => ({
															...previous,
															region: value,
														}),
													)
												}
											/>
											<TextInputComponent
												label="Postal / ZIP Code"
												placeholder="V3W 0A8 or 98225"
												value={newAddress.postal}
												setValue={(value: string) =>
													setNewAddress(
														(previous) => ({
															...previous,
															postal: value,
														}),
													)
												}
											/>
										</div>
									</>
								)}
							</div>
						)}

						<div className="flex gap-[10px]">
							<button
								type="button"
								className={secondaryButton}
								onClick={() => setStep("customer")}
							>
								Back
							</button>
							<button
								type="button"
								className={primaryButton}
								disabled={busy}
								onClick={handleShippingNext}
							>
								Continue
							</button>
						</div>
					</div>
				)}

				{step === "details" && (
					<div className="flex flex-col gap-[14px]">
						{/* ! What is asked follows what the order actually does.
						    ! A pure pickup is never asked how many steps are
						    ! outside the house, and a mixed order is asked both
						    ! because both journeys are happening. */}
						{anyDelivered && (
							<div className="flex flex-col gap-[12px] rounded-[15px] border-[1.5px] border-[#E6EBE8] p-4">
								<span className="text-[13px] font-bold text-[#101614]">
									Delivery
								</span>

								<div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
									<TextInputComponent
										label="Delivery Date"
										type="date"
										value={details.delivery_date}
										setValue={(value: string) =>
											setDetail("delivery_date", value)
										}
									/>
									<SelectComponent
										label="Entrance Door"
										placeholder="Not asked"
										value={details.entrance_door}
										setValue={(value: string) =>
											setDetail(
												"entrance_door",
												value as
													| ""
													| "single"
													| "double",
											)
										}
										data={[
											{
												id: "single",
												value: "single",
												label: "Single",
											},
											{
												id: "double",
												value: "double",
												label: "Double",
											},
										]}
									/>
									<SelectComponent
										label="Level"
										placeholder="Not asked"
										value={details.entrance_level}
										setValue={(value: string) =>
											setDetail(
												"entrance_level",
												value as
													| ""
													| "ground"
													| "upstairs"
													| "basement",
											)
										}
										data={[
											{
												id: "ground",
												value: "ground",
												label: "Ground Level",
											},
											{
												id: "upstairs",
												value: "upstairs",
												label: "Upstairs",
											},
											{
												id: "basement",
												value: "basement",
												label: "Basement",
											},
										]}
									/>
								</div>

								<GroupComponent gap="sm" grow>
									<TextInputComponent
										label="Steps outside home"
										type="number"
										min={0}
										placeholder="0"
										value={
											details.steps_outside === null
												? ""
												: String(details.steps_outside)
										}
										setValue={(value: string) =>
											setDetail(
												"steps_outside",
												parseStepCount(value),
											)
										}
									/>
									<TextInputComponent
										label="Steps inside home"
										type="number"
										min={0}
										placeholder="0"
										value={
											details.steps_inside === null
												? ""
												: String(details.steps_inside)
										}
										setValue={(value: string) =>
											setDetail(
												"steps_inside",
												parseStepCount(value),
											)
										}
									/>
								</GroupComponent>

								{/* ! Recorded, not charged. The fee is collected at
								    ! the door if the work happens, which is what the
								    ! invoice's own terms promise. */}
								<div className="flex flex-col gap-[8px]">
									<span className="text-[12.5px] text-[#6B7770]">
										Tick what applies. Extras are recorded
										for the driver and charged on the day if
										needed.
									</span>
									{(
										[
											["hoses_bought", "Hoses bought"],
											["door_removal", "Door removal"],
											["dryer_vent", "Dryer vent"],
										] as const
									).map(([key, label]) => (
										<div
											key={key}
											className="flex items-center justify-between gap-3"
										>
											<span className="text-[13px] text-[#3C4A42]">
												{label}
											</span>
											<div className="flex shrink-0 gap-[6px]">
												{(
													[
														[true, "Yes"],
														[false, "No"],
													] as const
												).map(([answer, text]) => (
													<button
														key={text}
														type="button"
														aria-pressed={
															details[key] ===
															answer
														}
														onClick={() =>
															// A second press clears it back to
															// "nobody asked", which is a real
															// answer on this form.
															setDetail(
																key,
																details[key] ===
																	answer
																	? null
																	: answer,
															)
														}
														className={`rounded-[10px] border-[1.5px] px-3 py-1 text-[12px] font-semibold transition-colors ${
															details[key] ===
															answer
																? "border-[#0F6B37] bg-[#F3F9F5] text-[#0F6B37]"
																: "border-[#E6EBE8] bg-white text-[#6B7770] hover:border-[#0F6B37]"
														}`}
													>
														{text}
													</button>
												))}
											</div>
										</div>
									))}
								</div>

								{/* ! One step per line, and the slip numbers them.
								    A driver carrying a fridge reads a checklist,
								    not a paragraph - and the person dictating at
								    the counter says them one at a time anyway. */}
								<TextAreaInputComponent
									label="Delivery Instructions"
									description="One step per line. The slip numbers them."
									placeholder={[
										"Park in the alley behind the house",
										"Use the side gate, code 4417",
										"Remove the screen door before carrying in",
									].join("\n")}
									autosize
									minRows={3}
									value={details.delivery_instructions}
									setValue={(value: string) =>
										setDetail("delivery_instructions", value)
									}
								/>
							</div>
						)}

						{anyCollected && (
							<div className="flex flex-col gap-[12px] rounded-[15px] border-[1.5px] border-[#E6EBE8] p-4">
								<span className="text-[13px] font-bold text-[#101614]">
									Pickup
								</span>

								<TextInputComponent
									label="Pickup Date"
									type="date"
									value={details.pickup_date}
									setValue={(value: string) =>
										setDetail("pickup_date", value)
									}
								/>
								<TextAreaInputComponent
									label="Pickup Instructions"
									description="One step per line. The slip numbers them."
									placeholder={[
										"Bring photo ID",
										"Collect from the rear loading bay",
										"Bring straps - the van is not loaded for you",
									].join("\n")}
									autosize
									minRows={3}
									value={details.pickup_instructions}
									setValue={(value: string) =>
										setDetail("pickup_instructions", value)
									}
								/>
							</div>
						)}

						<TextAreaInputComponent
							label="Note (optional)"
							placeholder="Anything about this order - prints on the invoice."
							value={details.order_note}
							setValue={(value: string) =>
								setDetail("order_note", value)
							}
						/>

						<div className="flex gap-[10px]">
							<button
								type="button"
								className={secondaryButton}
								onClick={() => setStep("shipping")}
							>
								Back
							</button>
							<button
								type="button"
								className={primaryButton}
								disabled={busy}
								onClick={handleDetailsNext}
							>
								Continue
							</button>
						</div>
					</div>
				)}

				{step === "signature" && (
					<div className="flex flex-col gap-[12px]">
						{/* ! The consent statement is no longer drawn here. P28 puts
						    it directly above the pad so it is visibly part of what
						    is being signed, and the pad is the modal this step
						    opens - so it lives there now. */}
						<div className="rounded-[15px] border border-dashed border-[#DFE6E2] bg-[#FAFCFB] px-4 py-5 text-center text-[13.5px] text-[#6B7A74]">
							No invoice exists until the customer has signed.
						</div>

						<div className="flex gap-[10px]">
							<button
								type="button"
								className={secondaryButton}
								onClick={() => setStep("shipping")}
							>
								Back
							</button>
							<button
								type="button"
								className={primaryButton}
								disabled={busy}
								onClick={() => setSignatureOpen(true)}
							>
								Take signature
							</button>
						</div>
					</div>
				)}

				{step === "payment" && (
					<div className="flex flex-col gap-[12px]">
						{signedAt && (
							<div className="flex items-center gap-2 rounded-[13px] border border-[#BFE3CD] bg-[#F3F9F5] px-4 py-3 text-[13.5px] font-semibold text-[#0B4A2A]">
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden
								>
									<path d="M20 6L9 17l-5-5" />
								</svg>
								Signature captured. The invoice is created when
								you finish.
							</div>
						)}

						{layaway ? (
							<div
								role="status"
								className="rounded-[13px] border border-[#E7D3AE] bg-[#FBF5EA] px-4 py-3 text-[13.5px] text-[#7A5410]"
							>
								<strong>{`Layaway ${layaway.layaway_no}.`}</strong>{" "}
								{`Paid $${layaway.paid_amount} of $${layaway.original_amount}.`}{" "}
								{Number(layaway.paid_amount) >=
								Number(layaway.original_amount)
									? "Paid in full - nothing is taken here."
									: "The balance stays owing under the manager's release and is taken on the Layaways screen."}
							</div>
						) : amountDueMinor > 0 ? (
							<PosPaymentTenders
								tenders={tenders}
								onChange={setTenders}
								paymentTypes={PAYMENT_TYPES}
								grandTotalMinor={amountDueMinor}
								anyDelivered={anyDelivered}
								anyCollected={anyCollected}
							/>
						) : (
							<div className="rounded-[13px] border border-[#B8D8F0] bg-[#F2F8FD] px-4 py-3 text-[13.5px] text-[#164E73]">
								<strong>No payment is required.</strong> The
								exchange credit covers this replacement.
								{unusedExchangeCreditMinor > 0 && (
									<span className="mt-1 block font-semibold">
										Unused balance: $
										{(
											unusedExchangeCreditMinor / 100
										).toFixed(2)}
									</span>
								)}
							</div>
						)}

						{!layaway && amountDueMinor > 0 && (
							<div className="flex flex-col gap-[7px]">
								<span className="text-[11.5px] font-bold tracking-[0.08em] text-[#8A968F]">
									PAYMENT TYPE{" "}
									<span className="text-[#B4322F]">*</span>
								</span>
								<div className="grid grid-cols-3 gap-[7px]">
									{PAYMENT_TYPES.map((option) => {
										// ! `effectivePaymentType`, so the grid shows
										// ! the answer the tenders already gave
										// ! rather than sitting blank beside them.
										const on =
											effectivePaymentType ===
											option.value;

										return (
											<button
												type="button"
												key={option.id}
												aria-pressed={on}
												onClick={() =>
													setPaymentType(option.value)
												}
												className={`flex min-h-[52px] items-center justify-center rounded-[12px] border-[1.5px] px-2 text-center text-[13px] leading-[1.15] ${
													on
														? "border-[#0F6B37] bg-[#0F6B37] font-extrabold text-white"
														: "border-[#DFE6E2] bg-white font-semibold text-[#22302B] hover:bg-[#F2F5F3]"
												}`}
											>
												{option.label}
											</button>
										);
									})}
								</div>
							</div>
						)}

						<div className="flex gap-[10px]">
							<button
								type="button"
								className={secondaryButton}
								onClick={() => setStep("signature")}
							>
								Back
							</button>
							<button
								type="button"
								className={primaryButton}
								disabled={
									busy ||
									(!layaway &&
										amountDueMinor > 0 &&
										!effectivePaymentType)
								}
								onClick={handleCheckout}
							>
								{busy ? "Creating invoice…" : "Complete sale"}
							</button>
						</div>
					</div>
				)}
			</div>

			{signatureOpen && (
				<DigitalSignatureModal
					isOpen={signatureOpen}
					onClose={() => setSignatureOpen(false)}
					onConfirm={handleSignature}
					// ! No skip. A55: no invoice exists without a signature, so
					// ! there is nothing to skip to. The prop is gone from the
					// ! modal itself now rather than passed and ignored here -
					// ! the legacy till was still wiring it to "close the pad
					// ! and bill them anyway".
					customerName={chosen?.label?.split(" · ")[0] ?? ""}
					// P28. Owned here because `handleSignature` posts it with
					// the signature, drawn there because that is where the
					// customer is looking when they agree to it.
					consent={consent}
					onConsentChange={setConsent}
				/>
			)}

			{customerModal && (
				<AddCustomerModal
					/**
					 * ! Keyed on which customer is being edited, so choosing a
					 * ! different one and reopening does not reuse the first
					 * ! one's state - the form seeds from props once, and a
					 * ! remount is what makes "seed once" mean "once per
					 * ! customer".
					 */
					key={editing ? editing.customer_id : "new"}
					isOpen={customerModal}
					onClose={() => setCustomerModal(false)}
					setCallApi={setCallApi}
					customerId={editing?.customer_id}
					initialValueName={editing?.name ?? ""}
					initialValueFirstName={editing?.first_name ?? undefined}
					initialValueLastName={editing?.last_name ?? undefined}
					initialValuePhoneNumber={editing?.phone}
					initialValuePhones={editing?.phones}
					initialValueEmail={editing?.email}
					initialValueAddress={editing?.address}
					initialValueAddressLine2={editing?.address_line_2}
					initialValueCity={editing?.city}
					initialValueState={editing?.state}
					initialValuePinCode={editing?.pinCode}
					variant="pos"
					onSaved={(customer) => setCustomerId(customer.customer_id)}
				/>
			)}
		</ModalComponent>
	);
};

export default PosCheckoutFlow;
