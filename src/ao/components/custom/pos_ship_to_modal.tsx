"use client";

import React, {
	Dispatch,
	SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useRouter } from "next/navigation";
import { ModalComponent } from "../mantine";
import ShowNotification from "../mantine/show_notification";
import { AddressAutocomplete } from "./address_autocomplete";
import {
	createCustomerAddressApi,
	getCustomerAddressesApi,
	isValidPostal,
	logoutUser,
	normalisePostal,
	POSTAL_FORMAT_MESSAGE as POSTAL_MESSAGE,
	upsertCustomerApi,
} from "../../utils";

/** One row of `customer_address`, as `GET /pos/customers/:id/addresses` sends it. */
export interface SavedAddress {
	customer_address_id: string;
	street: string | null;
	city: string | null;
	/** "State" on the form; the column is named for both sides of the border. */
	region: string | null;
	postal: string;
	label: string | null;
}

interface Props {
	isOpen: boolean;
	onClose: () => void;
	/** Empty when nobody has been chosen yet - saving is then unavailable. */
	customerId: string;
	customerName: string;
	/** Required by the customer upsert, so billing cannot be saved without it. */
	customerPhone: string;
	/** The customer record's own address, which is the billing address. */
	billing: {
		address?: string;
		city?: string;
		state?: string;
		pinCode?: string;
	};
	address: string | undefined;
	setAddress: Dispatch<SetStateAction<string | undefined>>;
	city: string | undefined;
	setCity: Dispatch<SetStateAction<string | undefined>>;
	state: string | undefined;
	setState: Dispatch<SetStateAction<string | undefined>>;
	pinCode: string | undefined;
	setPinCode: Dispatch<SetStateAction<string | undefined>>;
	/** Called after the billing address is written, so the till refetches. */
	onBillingSaved?: () => void;
}

/**
 * ! The street fields offer the rest of the address. `AddressAutocomplete` is a
 * ! plain input until a provider is configured, so with none set this modal
 * ! behaves exactly as it did before.
 */
const fieldClass =
	"h-[54px] w-full rounded-[13px] border-[1.5px] border-[#DFE6E2] bg-[#F7FAF8] px-[14px] text-[16px] text-[#101614] outline-none placeholder:text-[#8A968F] focus:border-[#0F6B37]";

const labelClass = "text-[12.5px] font-bold text-[#6B7A74]";

const sectionClass =
	"text-[12.5px] font-bold tracking-[0.06em] text-[#8A968F]";

const oneLine = (parts: Array<string | null | undefined>) =>
	parts.filter((part) => part && String(part).trim()).join(", ");

/**
 * Where the order is delivered, and who it is billed to.
 *
 * ! Replaces the modal that typed a fresh address at every order and kept none
 * ! of them, so a repeat customer's address was re-keyed - and mis-keyed - every
 * ! time. `customer_address` and its two endpoints already existed for the
 * ! serialised till; this puts the legacy till on them.
 *
 * Shipping and billing are separate on purpose. The checkbox is the shortcut for
 * the common case, and unticking it leaves both editable rather than hiding one.
 */
export const PosShipToModal = (props: Props) => {
	const {
		isOpen,
		onClose,
		customerId,
		customerName,
		customerPhone,
		billing,
		address,
		setAddress,
		city,
		setCity,
		state,
		setState,
		pinCode,
		setPinCode,
		onBillingSaved,
	} = props;

	const router = useRouter();

	const [saved, setSaved] = useState<SavedAddress[]>([]);
	const [sameAsBilling, setSameAsBilling] = useState(false);
	const [selectedAddressId, setSelectedAddressId] = useState<string>("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<{
		field: "postal" | "billingPostal";
		message: string;
	} | null>(null);

	/** The shipping address being typed, before it is saved. */
	const [draft, setDraft] = useState({
		street: "",
		city: "",
		region: "",
		postal: "",
		label: "",
	});

	/** The billing address being edited, which is the customer record. */
	const [billingDraft, setBillingDraft] = useState({
		address: "",
		city: "",
		state: "",
		pinCode: "",
	});

	/**
	 * ! The till's own address state is written through as the operator works,
	 * ! so Cancel has to put back what was there when the modal opened, or it
	 * ! would only look like a cancel while leaving half an address on the order
	 * ! (D29).
	 */
	const opened = useRef({ address, city, state, pinCode });

	const hasBilling = Boolean(
		billing.address || billing.city || billing.state || billing.pinCode,
	);

	const loadAddresses = useCallback(() => {
		if (!customerId) {
			setSaved([]);

			return;
		}

		getCustomerAddressesApi(
			customerId,
			(data: { addresses: SavedAddress[] }) =>
				setSaved(data.addresses ?? []),
			() => {},
			() => logoutUser(router),
		).then();
	}, [customerId, router]);

	useEffect(() => {
		if (!isOpen) return;

		opened.current = { address, city, state, pinCode };
		setError(null);
		setSelectedAddressId("");
		setDraft({
			street: address ?? "",
			city: city ?? "",
			region: state ?? "",
			postal: pinCode ?? "",
			label: "",
		});
		setBillingDraft({
			address: billing.address ?? "",
			city: billing.city ?? "",
			state: billing.state ?? "",
			pinCode: billing.pinCode ?? "",
		});
		// Ticked only when the order already matches billing, so re-opening the
		// modal does not silently re-copy over a deliberately different address.
		setSameAsBilling(
			hasBilling &&
				(address ?? "") === (billing.address ?? "") &&
				(pinCode ?? "") === (billing.pinCode ?? ""),
		);
		loadAddresses();
		// ! Keyed on `isOpen` alone: listing the values would re-take the
		// ! snapshot on every keystroke and Cancel would restore nothing.
	}, [isOpen]);

	const applyToOrder = (next: {
		street?: string | null;
		city?: string | null;
		region?: string | null;
		postal?: string | null;
	}) => {
		setAddress(next.street ?? "");
		setCity(next.city ?? "");
		setState(next.region ?? "");
		setPinCode(next.postal ?? "");
	};

	const handleCancel = () => {
		setAddress(opened.current.address);
		setCity(opened.current.city);
		setState(opened.current.state);
		setPinCode(opened.current.pinCode);
		setError(null);
		onClose();
	};

	const handleUseSaved = (entry: SavedAddress) => {
		setSameAsBilling(false);
		setSelectedAddressId(entry.customer_address_id);
		setDraft({
			street: entry.street ?? "",
			city: entry.city ?? "",
			region: entry.region ?? "",
			postal: entry.postal,
			label: entry.label ?? "",
		});
		applyToOrder(entry);
		setError(null);
	};

	const handleSameAsBilling = (checked: boolean) => {
		setSameAsBilling(checked);
		setError(null);

		if (!checked) return;

		setSelectedAddressId("");
		setDraft({
			street: billing.address ?? "",
			city: billing.city ?? "",
			region: billing.state ?? "",
			postal: billing.pinCode ?? "",
			label: "Same as billing",
		});
		applyToOrder({
			street: billing.address,
			city: billing.city,
			region: billing.state,
			postal: billing.pinCode,
		});
	};

	/** Writes the billing address onto the customer record. */
	const handleSaveBilling = async () => {
		if (!customerId) {
			ShowNotification(
				"Choose a customer before saving billing",
				"error",
			);

			return;
		}

		const anyPart =
			billingDraft.address ||
			billingDraft.city ||
			billingDraft.state ||
			billingDraft.pinCode;

		// The server's rule, applied at the field: an address is only an address
		// once it carries the one part that makes it deliverable.
		if (anyPart && !isValidPostal(billingDraft.pinCode)) {
			setError({ field: "billingPostal", message: POSTAL_MESSAGE });

			return;
		}

		setBusy(true);

		await upsertCustomerApi(
			{
				id: customerId,
				phone: customerPhone,
				address: billingDraft.address || undefined,
				city: billingDraft.city || undefined,
				state: billingDraft.state || undefined,
				pinCode: billingDraft.pinCode
					? normalisePostal(billingDraft.pinCode)
					: undefined,
			},
			() => {
				ShowNotification("Billing address saved", "success");
				onBillingSaved?.();
			},
			(message: string) => ShowNotification(message, "error"),
			() => logoutUser(router),
		);

		setBusy(false);
	};

	const handleSubmit = async () => {
		const anyPart =
			draft.street || draft.city || draft.region || draft.postal;

		if (!anyPart) {
			// Nothing typed and nothing picked: clear the order's address rather
			// than refusing. A collection order has no delivery address.
			applyToOrder({});
			onClose();

			return;
		}

		if (!isValidPostal(draft.postal)) {
			setError({ field: "postal", message: POSTAL_MESSAGE });

			return;
		}

		const postal = normalisePostal(draft.postal);

		applyToOrder({
			street: draft.street,
			city: draft.city,
			region: draft.region,
			postal,
		});

		// Keep it for next time. An address that matches one already on file is
		// returned by the server rather than duplicated.
		if (customerId && !selectedAddressId) {
			setBusy(true);

			await createCustomerAddressApi(
				customerId,
				{
					street: draft.street || undefined,
					city: draft.city || undefined,
					region: draft.region || undefined,
					postal,
					label: draft.label || undefined,
				},
				() => {},
				(message: string) => ShowNotification(message, "error"),
				() => logoutUser(router),
			);

			setBusy(false);
		}

		setError(null);
		onClose();
	};

	return (
		<ModalComponent
			opened={isOpen}
			onClose={handleCancel}
			size="xl"
			radius={22}
			title={
				<div className="flex flex-col gap-[3px]">
					<span className="text-[21px] font-extrabold tracking-[-0.02em] text-[#101614]">
						Shipping address
					</span>
					<span className="text-[13.5px] text-[#6B7A74]">
						{customerName
							? `Where ${customerName}'s order gets delivered`
							: "Where this order gets delivered"}
					</span>
				</div>
			}
		>
			<div className="flex flex-col gap-4 font-manrope">
				{/* The sheet is taller than a 1080 till once billing is on it, so
				    the sections scroll and Cancel / Use stay put below them. */}
				<div className="flex max-h-[58vh] flex-col gap-4 overflow-y-auto pr-1">
					<label
						className={`flex items-center gap-3 rounded-[14px] border p-[14px] ${
							hasBilling
								? "cursor-pointer border-[#DFE6E2] bg-[#F7FAF8] hover:border-[#0F6B37]"
								: "cursor-not-allowed border-[#E6EBE8] bg-[#FAFCFB]"
						}`}
					>
						<input
							type="checkbox"
							className="h-5 w-5 accent-[#0F6B37]"
							checked={sameAsBilling}
							disabled={!hasBilling}
							onChange={(event) =>
								handleSameAsBilling(event.target.checked)
							}
						/>
						<span className="flex flex-col gap-[2px]">
							<span className="text-[15px] font-bold text-[#101614]">
								Same as billing address
							</span>
							<span className="text-[12.5px] text-[#6B7A74]">
								{hasBilling
									? oneLine([
											billing.address,
											billing.city,
											billing.state,
											billing.pinCode,
										])
									: "This customer has no billing address on file yet — set one below."}
							</span>
						</span>
					</label>

					{!sameAsBilling && saved.length > 0 && (
						<div className="flex flex-col gap-[10px]">
							<span className={sectionClass}>SAVED ADDRESSES</span>
							{saved.map((entry) => {
								const on =
									entry.customer_address_id === selectedAddressId;

								return (
									<button
										type="button"
										key={entry.customer_address_id}
										onClick={() => handleUseSaved(entry)}
										className={`flex items-center justify-between gap-3 rounded-[15px] border-[1.5px] p-4 text-left ${
											on
												? "border-[#0F6B37] bg-[#F3F9F5]"
												: "border-[#E6EBE8] bg-white hover:border-[#0F6B37] hover:bg-[#F7FAF8]"
										}`}
									>
										<span className="flex min-w-0 flex-col gap-[3px]">
											<span className="text-[15.5px] font-bold text-[#101614]">
												{entry.label || "Saved address"}
											</span>
											<span className="text-[13.5px] text-[#6B7A74]">
												{oneLine([
													entry.street,
													entry.city,
													entry.region,
													entry.postal,
												])}
											</span>
										</span>
										<span
											className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-[15px] font-extrabold ${
												on
													? "bg-[#0F6B37] text-white"
													: "bg-[#EDF1EF] text-transparent"
											}`}
										>
											✓
										</span>
									</button>
								);
							})}
						</div>
					)}

					{!sameAsBilling && (
						<div className="flex flex-col gap-[10px]">
							<span className={sectionClass}>
								{selectedAddressId ? "ADDRESS" : "NEW ADDRESS"}
							</span>
							<AddressAutocomplete
								id="ship-to-street"
								className={fieldClass}
								placeholder="Street address"
								aria-label="Address"
								value={draft.street}
								onChange={(street) => {
									setSelectedAddressId("");
									setDraft((prev) => ({ ...prev, street }));
								}}
								/**
								 * ! City, State and ZIP are filled from the row
								 * ! the operator chose, and only from that -
								 * ! nothing here guesses. A ZIP the geocoder
								 * ! did not have stays empty rather than
								 * ! inventing one, because this modal refuses
								 * ! to save without a valid one and a plausible
								 * ! wrong ZIP would sail straight past that.
								 */
								onPick={(suggestion) => {
									setSelectedAddressId("");
									setError(null);
									setDraft((prev) => ({
										...prev,
										street: suggestion.street,
										city: suggestion.city || prev.city,
										region: suggestion.region || prev.region,
										postal: suggestion.postal || prev.postal,
									}));
								}}
							/>
							<div className="grid grid-cols-3 gap-3">
								<label className="flex flex-col gap-[6px]">
									<span className={labelClass}>City</span>
									<input
										className={fieldClass}
										placeholder="City"
										value={draft.city}
										onChange={(event) => {
											setSelectedAddressId("");
											setDraft((prev) => ({
												...prev,
												city: event.target.value,
											}));
										}}
									/>
								</label>
								{/* Was "Province". The shop sells both sides of the
								    border and the client asked for one word (2026-08-15). */}
								<label className="flex flex-col gap-[6px]">
									<span className={labelClass}>State</span>
									<input
										className={fieldClass}
										placeholder="State"
										value={draft.region}
										onChange={(event) => {
											setSelectedAddressId("");
											setDraft((prev) => ({
												...prev,
												region: event.target.value,
											}));
										}}
									/>
								</label>
								<label className="flex flex-col gap-[6px]">
									<span className={labelClass}>
										Postal / ZIP Code
									</span>
									<input
										className={fieldClass}
										placeholder="V3W 0A8 or 98225"
										aria-label="Postal / ZIP Code"
										value={draft.postal}
										onChange={(event) => {
											setSelectedAddressId("");
											setError(null);
											setDraft((prev) => ({
												...prev,
												postal: event.target.value,
											}));
										}}
									/>
								</label>
							</div>
							{error?.field === "postal" && (
								<span className="text-[13px] font-semibold text-[#B4322F]">
									{error.message}
								</span>
							)}
							<input
								className={fieldClass}
								placeholder="Label this address (Home, Job site)"
								aria-label="Address label"
								value={draft.label}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										label: event.target.value,
									}))
								}
							/>
						</div>
					)}

					<div className="h-px bg-[#E6EBE8]" />

					<div className="flex flex-col gap-[10px]">
						<span className={sectionClass}>BILLING ADDRESS</span>
						<span className="-mt-1 text-[13px] text-[#6B7A74]">
							Kept on the customer record, so every future order can
							start from it.
						</span>
						<AddressAutocomplete
							id="billing-street"
							className={fieldClass}
							placeholder="Street address"
							aria-label="Billing address"
							value={billingDraft.address}
							onChange={(street) =>
								setBillingDraft((prev) => ({
									...prev,
									address: street,
								}))
							}
							onPick={(suggestion) => {
								setError(null);
								setBillingDraft((prev) => ({
									...prev,
									address: suggestion.street,
									city: suggestion.city || prev.city,
									state: suggestion.region || prev.state,
									pinCode: suggestion.postal || prev.pinCode,
								}));
							}}
						/>
						<div className="grid grid-cols-3 gap-3">
							<label className="flex flex-col gap-[6px]">
								<span className={labelClass}>City</span>
								<input
									className={fieldClass}
									placeholder="City"
									aria-label="Billing city"
									value={billingDraft.city}
									onChange={(event) =>
										setBillingDraft((prev) => ({
											...prev,
											city: event.target.value,
										}))
									}
								/>
							</label>
							<label className="flex flex-col gap-[6px]">
								<span className={labelClass}>State</span>
								<input
									className={fieldClass}
									placeholder="State"
									aria-label="Billing state"
									value={billingDraft.state}
									onChange={(event) =>
										setBillingDraft((prev) => ({
											...prev,
											state: event.target.value,
										}))
									}
								/>
							</label>
							<label className="flex flex-col gap-[6px]">
								<span className={labelClass}>
									Postal / ZIP Code
								</span>
								<input
									className={fieldClass}
									placeholder="V3W 0A8 or 98225"
									aria-label="Billing postal / ZIP Code"
									value={billingDraft.pinCode}
									onChange={(event) => {
										setError(null);
										setBillingDraft((prev) => ({
											...prev,
											pinCode: event.target.value,
										}));
									}}
								/>
							</label>
						</div>
						{error?.field === "billingPostal" && (
							<span className="text-[13px] font-semibold text-[#B4322F]">
								{error.message}
							</span>
						)}
						<button
							type="button"
							onClick={handleSaveBilling}
							disabled={busy || !customerId}
							className="h-[48px] self-start rounded-[13px] border border-[#DFE6E2] bg-white px-5 text-[14px] font-bold text-[#22302B] hover:bg-[#F2F5F3] disabled:opacity-50"
						>
							{customerId
								? "Save billing address"
								: "Choose a customer to save billing"}
						</button>
					</div>
				</div>

				{/* D29: Save was the only control, so the ✕ was the only way out
				    and it left whatever had been typed on the order. */}
				<div className="flex gap-[10px] border-t border-[#E6EBE8] pt-3">
					<button
						type="button"
						onClick={handleCancel}
						className="h-[56px] flex-1 rounded-[14px] border border-[#DFE6E2] bg-white text-[16px] font-bold text-[#22302B] hover:bg-[#F2F5F3]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={busy}
						className="h-[56px] flex-[2] rounded-[14px] bg-[#0F6B37] text-[16.5px] font-extrabold text-white hover:bg-[#0A522A] disabled:opacity-60"
					>
						Use this address
					</button>
				</div>
			</div>
		</ModalComponent>
	);
};

export default PosShipToModal;
