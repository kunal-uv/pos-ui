"use client";

import React from "react";
import { CurrencyInputComponent } from "../mantine";
import { posMoneyFieldStyles } from "./pos_design";

/**
 * The three order-level charges, exactly as §7.3 wants them (CHK-06, P9, A35).
 */
export interface OrderCharges {
	delivery_charge: string;
	removal_charge: string;
	relocation_charge: string;
}

export const EMPTY_CHARGES: OrderCharges = {
	delivery_charge: "0",
	removal_charge: "0",
	relocation_charge: "0",
};

/** The order they appear in on the breakup: rows 4, 5, 6. */
const FIELDS: Array<{ key: keyof OrderCharges; label: string }> = [
	{ key: "delivery_charge", label: "Delivery" },
	{ key: "removal_charge", label: "Removal" },
	{ key: "relocation_charge", label: "Relocation" },
];

interface Props {
	charges: OrderCharges;
	disabled?: boolean;
	/** Fires on every keystroke. The caller debounces the save. */
	onChange: (next: OrderCharges) => void;
	/** Fires when a field loses focus, so nothing is left unsaved. */
	onCommit: (next: OrderCharges) => void;
}

/**
 * Charges that belong to the order rather than to a machine (CHK-06, P9, A35).
 *
 * ! **Three fields, never one.** They are each taxable, they each feed the
 * ! subtotal, and each draws its own row on the breakup and the printed invoice
 * ! - rows 4, 5 and 6 of the ten. §7.3 forbids rolling them into a single
 * ! "services" figure, which is what makes three inputs the requirement rather
 * ! than a layout choice.
 *
 * ! **Removal is here and not on the cart line.** It used to be a per-item
 * ! charge on the card (P8, CHK-04): a customer taking away two fridges was
 * ! charged removal twice, once per appliance, for one visit by one van.
 *
 * ! Nothing here adds anything up. The figures go to the server, and the totals
 * ! come back from `POST /pricing/breakup` (Rule E, F-03).
 */
export const PosOrderCharges = ({
	charges,
	disabled,
	onChange,
	onCommit,
}: Props) => (
	<div className="flex flex-none flex-col gap-[7px] border-t border-[#E6EBE8] bg-[#FBFCFB] px-4 py-3">
		<div className="flex items-center justify-between">
			<span className="text-[11.5px] font-bold tracking-[0.08em] text-[#8A968F]">
				ORDER CHARGES
			</span>
			<span className="text-[11.5px] text-[#8A968F]">
				Each taxed and printed on its own line
			</span>
		</div>

		<div className="grid grid-cols-3 gap-[7px]">
			{FIELDS.map((field) => (
				<label
					key={field.key}
					className="flex h-[62px] flex-col justify-center gap-[2px] rounded-[12px] border border-[#DFE6E2] bg-white px-3 focus-within:border-[#0F6B37]"
				>
					<span className="text-[11.5px] font-semibold text-[#6B7A74]">
						{field.label}
					</span>
					{/* D28: money, so no spinner. The prefix stays inside the
					    field rather than beside it, so what the operator reads
					    back is what the field actually holds. */}
					<CurrencyInputComponent
						w="100%"
						size="xs"
						variant="unstyled"
						aria-label={field.label}
						styles={posMoneyFieldStyles}
						disabled={disabled}
						value={Number(charges[field.key] ?? 0)}
						setValue={(value: string | number) =>
							onChange({
								...charges,
								[field.key]: String(value ?? "0"),
							})
						}
						onBlur={() => onCommit(charges)}
					/>
				</label>
			))}
		</div>
	</div>
);

export default PosOrderCharges;
