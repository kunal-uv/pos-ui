"use client";

import React, { useMemo, useState } from "react";
import { ModalComponent } from "../mantine";
import { CustomerModel } from "../../models";
import { posInitials } from "./pos_design";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	customers: CustomerModel[];
	selectedCustomerId: string;
	onSelect: (customer: CustomerModel) => void;
	/** Opens the existing Add Customer form, which is the only thing that
	 *  actually creates a record. */
	onCreateNew: () => void;
}

/**
 * Picking who the sale is for.
 *
 * ! Replaces the `Select` that used to sit at the top of the cart. A dropdown of
 * ! every customer in the shop, read at arm's length on a touch screen, is a
 * ! list of names with nothing to tell two Smiths apart; this shows the phone
 * ! number the cashier is being read down the counter, and the rows are big
 * ! enough to hit with a thumb.
 */
export const PosCustomerModal = (props: Props) => {
	const {
		isOpen,
		onClose,
		customers,
		selectedCustomerId,
		onSelect,
		onCreateNew,
	} = props;

	const [query, setQuery] = useState("");

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();

		if (!needle) return customers;

		return customers.filter((customer) =>
			`${customer.name ?? ""} ${customer.phone ?? ""} ${customer.email ?? ""}`
				.toLowerCase()
				.includes(needle),
		);
	}, [customers, query]);

	return (
		<ModalComponent
			opened={isOpen}
			onClose={onClose}
			size="lg"
			radius={22}
			title={
				<div className="flex flex-col gap-[3px]">
					<span className="text-[21px] font-extrabold tracking-[-0.02em] text-[#101614]">
						Select customer
					</span>
					<span className="text-[13.5px] text-[#6B7A74]">
						Search by name, phone or email
					</span>
				</div>
			}
		>
			<div className="flex flex-col gap-3 font-manrope">
				<div className="flex h-[58px] items-center gap-3 rounded-[14px] border-[1.5px] border-[#DFE6E2] bg-[#F7FAF8] px-4 focus-within:border-[#0F6B37]">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#6B7A74"
						strokeWidth="2.1"
						strokeLinecap="round"
						aria-hidden
					>
						<circle cx="11" cy="11" r="7" />
						<path d="M20 20l-4.2-4.2" />
					</svg>
					<input
						autoFocus
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search name, phone or email…"
						aria-label="Search customers"
						className="flex-1 border-none bg-transparent text-[16.5px] font-medium text-[#101614] outline-none placeholder:text-[#8A968F]"
					/>
				</div>

				<div className="flex max-h-[46vh] flex-col gap-[10px] overflow-y-auto">
					{matches.length === 0 && (
						<div className="py-10 text-center text-[14px] text-[#8A968F]">
							No customer matches that search.
						</div>
					)}

					{matches.map((customer) => {
						const selected = customer.customer_id === selectedCustomerId;

						return (
							<button
								type="button"
								key={customer.customer_id}
								onClick={() => {
									onSelect(customer);
									onClose();
								}}
								className={`flex items-center gap-[14px] rounded-[14px] border p-[14px] text-left transition-colors ${
									selected
										? "border-[#0F6B37] bg-[#F3F9F5]"
										: "border-[#E6EBE8] bg-white hover:border-[#0F6B37] hover:bg-[#F7FAF8]"
								}`}
							>
								<span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-full bg-[#E7F2EB] text-[15px] font-extrabold text-[#0F6B37]">
									{posInitials(customer.name)}
								</span>
								<span className="flex min-w-0 flex-1 flex-col gap-[2px]">
									<span className="truncate text-[16px] font-bold text-[#101614]">
										{customer.name}
									</span>
									<span className="truncate font-plex-mono text-[12.5px] text-[#8A968F]">
										{[customer.phone, customer.city]
											.filter(Boolean)
											.join(" · ") || "No contact details"}
									</span>
								</span>
								{selected && (
									<span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-[#0F6B37] text-[15px] font-extrabold text-white">
										✓
									</span>
								)}
							</button>
						);
					})}
				</div>

				<button
					type="button"
					onClick={() => {
						onClose();
						onCreateNew();
					}}
					className="flex h-14 items-center justify-center gap-[9px] rounded-[14px] border border-dashed border-[#B9CEC2] bg-[#F7FAF8] text-[15.5px] font-bold text-[#0F6B37] transition-colors hover:bg-[#E7F2EB]"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						aria-hidden
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					Create new customer
				</button>
			</div>
		</ModalComponent>
	);
};

export default PosCustomerModal;
