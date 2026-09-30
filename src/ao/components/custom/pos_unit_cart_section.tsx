"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebouncedCallback } from "@mantine/hooks";
import { LoaderComponent } from "../mantine";
import ShowNotification from "../mantine/show_notification";
import { checkPermissions } from "./check_permission_entities";
import {
	currencySign,
	addPosCartLineApi,
	deletePosCartLineApi,
	getHeldCartsApi,
	getPriceBreakupApi,
	holdCartApi,
	getPosCartApi,
	logoutUser,
	layawaysRoute,
	quotationsRoute,
	resumeCartApi,
	updatePosCartApi,
	updatePosCartLineApi,
	type Breakup,
	type BreakupRow,
} from "../../utils";
import {
	PosUnitCartLine,
	type PosCartLine,
	type PosSerializedAddOn,
} from "./pos_unit_cart_line";
import { PosCheckoutFlow } from "./pos_checkout_flow";
import {
	EMPTY_CHARGES,
	PosOrderCharges,
	type OrderCharges,
} from "./pos_order_charges";
import { PriceBreakup } from "./price_breakup";
import WarrantyModal from "./warranty_modal";
import AdditionalNoteModal from "./additional_note";
import { PosSaleDocuments, type SaleFulfilment } from "./pos_sale_documents";
import type { PosDocumentInvoice } from "../../utils/print";
import { posItemsLabel, posLayout } from "./pos_design";
import { PosOpenLineItemModal } from "./pos_open_line_item_modal";

interface Props {
	/** Bumped by the grid whenever a unit is added, to force a reload. */
	refreshToken: number;
}

/** What `GET /pos/cart` returns, of which this panel uses a part. */
interface CartResponse extends Partial<OrderCharges> {
	cart_draft_id: string;
	lines: PosCartLine[];
	/** What the customer was credited for a machine they brought back (§9.2). */
	exchange_credit?: string;
	/** §8.4: set when this cart is a layaway's agreement. */
	layaway?: CartLayaway | null;
}

/** The layaway a cart belongs to, as `GET /pos/cart` reports it. */
export interface CartLayaway {
	layaway_id: string;
	layaway_no: string;
	status: string;
	original_amount: string;
	paid_amount: string;
	payments: Array<{ payment_type: string; amount: string }>;
}

/**
 * The cart, on serialised units (POS-08 … POS-11, POS-15, POS-17, CHK-05).
 *
 * ! Every figure on screen comes from the server. The lines come from
 * ! `GET /pos/cart`; the totals come from `POST /pricing/breakup`, which is the
 * ! one calculation (Rule E, F-03). This component adds nothing up - not even
 * ! the warranty it collects, which travels to the breakup as a per-line figure
 * ! and comes back inside the total.
 *
 * ! **The warranty is stored on the line, not held in the browser.** The
 * ! item-based till kept its cover in React state and posted it at checkout, so
 * ! a refresh mid-sale silently dropped it. `cart_draft_line.extended_warranty_id`
 * ! is written the moment it is chosen, the same as a price edit.
 */
export const PosUnitCartSection = ({ refreshToken }: Props) => {
	const router = useRouter();
	// §3.2 gates 1 & 2: only a manager may take a line below its grade price.
	// A salesperson can price it anywhere from the grade price upward; going
	// under it is stopped at the field with a toast, nothing more.
	const allowBelowList = checkPermissions("manager-approval", [
		"sell-below-list",
	]);
	const [cartId, setCartId] = useState<string | null>(null);
	const [lines, setLines] = useState<PosCartLine[]>([]);
	/** CHK-06: delivery, removal and relocation, each its own figure. */
	const [charges, setCharges] = useState<OrderCharges>(EMPTY_CHARGES);
	const [rows, setRows] = useState<BreakupRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [checkoutOpen, setCheckoutOpen] = useState(false);
	const [held, setHeld] = useState<
		{ cart_draft_id: string; name: string | null; line_count: number }[]
	>([]);
	/** The line whose cover is being chosen, by `cart_draft_line_id`. */
	const [warrantyLineId, setWarrantyLineId] = useState<string | null>(null);
	/** The line whose note is being written, by `cart_draft_line_id`. */
	const [noteLineId, setNoteLineId] = useState<string | null>(null);
	const [openLineItemOpen, setOpenLineItemOpen] = useState(false);
	/**
	 * CHK-23 / D19. Shown once when the till reopens on a cart that was already
	 * there - a cart surviving a refresh is only reassuring if the salesperson
	 * is told it survived.
	 */
	const [restored, setRestored] = useState(false);
	/** CHK-22: shown in the footer after a sale, and it stays reachable. */
	const [lastInvoice, setLastInvoice] = useState<{
		invoice_id: string;
		grand_total: string;
		fulfilment: SaleFulfilment;
		/** The sale, for the printed documents. */
		document?: PosDocumentInvoice | null;
	} | null>(null);
	/**
	 * IB-04. The invoice and the slips, offered the moment the sale completes.
	 *
	 * ! Separate state from `lastInvoice` on purpose: dismissing this must not
	 * ! clear the footer, and the footer has to be able to bring it back. A
	 * ! document nobody can reprint after closing one dialog is how a customer
	 * ! leaves without their paperwork.
	 */
	const [documentsOpen, setDocumentsOpen] = useState(false);
	/**
	 * ! Held on the cart server side, mirrored here only so the breakup can be
	 * ! re-asked for after an edit. Nothing on this screen decides it: it was
	 * ! set when the customer handed the old machine over the counter.
	 */
	const [exchangeCredit, setExchangeCredit] = useState("0");
	/**
	 * §8.4. A layaway's machines, prices and charges were agreed when the
	 * deposit was taken; the till shows them and takes them through checkout,
	 * but does not edit them. The API refuses the edits as well.
	 */
	const [layaway, setLayaway] = useState<CartLayaway | null>(null);
	const agreementLocked = layaway !== null;
	/** Recommendation waiting for an exact serialized unit to be chosen. */
	/** Mutations and their authoritative reload are one locked cart operation. */
	const cartLocked = busy || loading;

	/**
	 * ! Both arguments are passed in rather than read from state. This function
	 * ! is a dependency of `load`, and a `charges` dependency would give `load` a
	 * ! new identity on every keystroke - which would refetch the cart and
	 * ! overwrite the number being typed with the one the server last stored.
	 */
	const priceCart = useCallback(
		(
			current: PosCartLine[],
			currentCharges: OrderCharges,
			credit = "0",
			cartDraftId?: string | null,
		) => {
			if (current.length === 0) {
				setRows([]);

				return Promise.resolve();
			}

			return getPriceBreakupApi(
				{
					// ! Names the cart so the breakup can apply its customer's
					// ! tax-exempt / reseller standing (§9, §14) - the same
					// ! lookup checkout does, so the previewed total and the
					// ! issued invoice agree.
					...(cartDraftId ? { cart_draft_id: cartDraftId } : {}),
					lines: current.map((line) => ({
						msrp: line.msrp ?? line.grade_price,
						selling_price: line.selling_price,
						// ! Cover is billed here or nowhere. The item-based till
						// ! collected it, drew it on the line and then left it
						// ! out of the arithmetic entirely.
						extended_warranty_price:
							line.extended_warranty?.price ?? "0",
						// ! Billed here or nowhere, exactly like the cover
						// ! above. A ticked accessory that never reached the
						// ! arithmetic would be a checkbox that changes the
						// ! paperwork and not the price.
						add_ons_price: (line.selected_add_ons ?? [])
							.reduce(
								(total, addOn) =>
									total + Number(addOn.price ?? 0),
								0,
							)
							.toFixed(2),
					})),
					// CHK-06 / A35: three distinct figures, three distinct rows.
					delivery_charge: currentCharges.delivery_charge,
					removal_charge: currentCharges.removal_charge,
					relocation_charge: currentCharges.relocation_charge,
					// ! Off the grand total, after tax, and drawn as its own
					// ! row. The customer is being asked for the difference; a
					// ! till showing the full price of the new machine is a till
					// ! that gets argued with.
					exchange_credit: credit,
				},
				(data: { breakup: Breakup }) => setRows(data.breakup.rows),
				(message: string) => ShowNotification(message, "error"),
				() => logoutUser(router),
			);
		},
		[router],
	);

	const load = useCallback(() => {
		setLoading(true);

		getPosCartApi(
			(data: { cart: CartResponse | null }) => {
				const { cart } = data;
				const nextCharges: OrderCharges = {
					delivery_charge:
						cart?.delivery_charge ?? EMPTY_CHARGES.delivery_charge,
					removal_charge:
						cart?.removal_charge ?? EMPTY_CHARGES.removal_charge,
					relocation_charge:
						cart?.relocation_charge ??
						EMPTY_CHARGES.relocation_charge,
				};

				// Only on the first load of a session, and only when there was
				// something to restore.
				setRestored(
					(previous) =>
						previous ||
						Boolean(cart && (cart.lines?.length ?? 0) > 0),
				);
				setCartId(cart?.cart_draft_id ?? null);
				setLines(cart?.lines ?? []);
				setCharges(nextCharges);
				setExchangeCredit(cart?.exchange_credit ?? "0");
				setLayaway(cart?.layaway ?? null);
				priceCart(
					cart?.lines ?? [],
					nextCharges,
					cart?.exchange_credit ?? "0",
					cart?.cart_draft_id ?? null,
				).finally(() => setLoading(false));
			},
			(message: string) => {
				ShowNotification(message, "error");
				setLoading(false);
			},
			() => logoutUser(router),
		).then();
	}, [priceCart, router]);

	useEffect(() => {
		load();
	}, [load, refreshToken]);

	const loadHeld = useCallback(() => {
		getHeldCartsApi(
			(data: {
				carts: {
					cart_draft_id: string;
					name: string | null;
					line_count: number;
				}[];
			}) => setHeld(data.carts ?? []),
			() => {},
			() => logoutUser(router),
		).then();
	}, [router]);

	useEffect(() => {
		loadHeld();
	}, [loadHeld, refreshToken]);

	const handleHold = async () => {
		if (!cartId || cartLocked) {
			return;
		}

		const name = window.prompt(
			"Name this held order, so you can find it again",
		);

		if (!name) {
			return;
		}

		// A held order keeps its charges, so anything pending goes first.
		commitCharges.flush();
		setBusy(true);

		await holdCartApi(
			cartId,
			name,
			() => {
				setBusy(false);
				ShowNotification(`Held as "${name}"`, "success");
				setRestored(false);
				load();
				loadHeld();
			},
			(message: string) => {
				setBusy(false);
				ShowNotification(message, "error");
			},
			() => logoutUser(router),
		);
	};

	const handleResume = async (id: string) => {
		if (cartLocked) return;

		setBusy(true);

		await resumeCartApi(
			id,
			() => {
				setBusy(false);
				load();
				loadHeld();
			},
			(message: string) => {
				setBusy(false);
				ShowNotification(message, "error");
			},
			() => logoutUser(router),
		);
	};

	/**
	 * CHK-06 + CHK-23. A charge is saved to the cart the same way a price edit
	 * is: on the server, on every change, so it survives a refresh.
	 *
	 * ! Debounced, because otherwise every keystroke of "120" is three writes
	 * ! and three re-prices. `lines` is passed in rather than closed over, so a
	 * ! save queued before a line was removed cannot re-price a stale cart.
	 */
	const commitCharges = useDebouncedCallback(
		(next: OrderCharges, currentLines: PosCartLine[], id: string) => {
			priceCart(currentLines, next, exchangeCredit, id);

			updatePosCartApi(
				id,
				{
					delivery_charge: next.delivery_charge,
					removal_charge: next.removal_charge,
					relocation_charge: next.relocation_charge,
				},
				() => {},
				(message: string) => {
					ShowNotification(message, "error");
					// Whatever the server still believes is the truth.
					load();
				},
				() => logoutUser(router),
			).then();
		},
		400,
	);

	const handleChargeChange = (next: OrderCharges) => {
		setCharges(next);

		if (cartId) {
			commitCharges(next, lines, cartId);
		}
	};

	/**
	 * ! On blur, without waiting. The debounce is a courtesy to the network; a
	 * ! charge typed and then immediately checked out must not be lost to it.
	 */
	const handleChargeCommit = (next: OrderCharges) => {
		if (cartId) {
			// Replaces whatever was pending, then sends it now. Flushing first
			// would post the superseded figure as well, for nothing.
			commitCharges(next, lines, cartId);
			commitCharges.flush();
		}
	};

	/** One write, one re-price: every line edit goes through here. */
	const patchLine = async (
		lineId: string,
		body: {
			selling_price?: string;
			additional_note?: string;
			extended_warranty_id?: string | null;
			add_ons?: Array<{
				add_on_id: string;
				price?: string;
				name?: string;
			}>;
		},
	) => {
		setBusy(true);

		await updatePosCartLineApi(
			lineId,
			body,
			(data: { line: PosCartLine }) => {
				setBusy(false);

				const next = lines.map((line) =>
					line.cart_draft_line_id === lineId ? data.line : line,
				);

				setLines(next);
				priceCart(next, charges, exchangeCredit, cartId);
			},
			(message: string) => {
				setBusy(false);
				ShowNotification(message, "error");
				// Put the line back to what the server still believes.
				load();
			},
			() => logoutUser(router),
		);
	};

	/**
	 * ! Straight through `patchLine`, so ticking an accessory re-prices the cart
	 * ! by the same path a price edit does. A checkbox that changed the
	 * ! paperwork without moving the total would be the worse kind of broken:
	 * ! nothing on screen would say it had gone wrong.
	 */
	const handleAddOns = async (
		lineId: string,
		selection: Array<{ add_on_id: string; price?: string; name?: string }>,
	) => {
		await patchLine(lineId, { add_ons: selection });
	};

	const handleOpenLineItem = async (item: {
		name: string;
		price: string;
	}) => {
		const parentLine = lines.find((line) => !line.add_on_for_line_id);
		if (!parentLine) return;
		const openId = `open-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
		await handleAddOns(parentLine.cart_draft_line_id, [
			...(parentLine.selected_add_ons ?? []).map((entry) => ({
				add_on_id: entry.add_on_id,
				price: entry.price,
				...(entry.add_on_id.startsWith("open-")
					? { name: entry.name }
					: {}),
			})),
			{ add_on_id: openId, name: item.name, price: item.price },
		]);
	};

	const handleSerializedAddOn = async (
		lineId: string,
		addOn: PosSerializedAddOn,
		selected: boolean,
	) => {
		if (!cartId) return;

		setBusy(true);

		if (selected) {
			await addPosCartLineApi(
				{
					cart_draft_id: cartId,
					inventory_unit_id: addOn.inventory_unit_id,
					add_on_for_line_id: lineId,
				},
				() => {
					setBusy(false);
					load();
				},
				(message: string) => {
					setBusy(false);
					ShowNotification(message, "error");
					load();
				},
				() => logoutUser(router),
			);

			return;
		}

		if (!addOn.selected_cart_line_id) {
			setBusy(false);
			load();

			return;
		}

		await deletePosCartLineApi(
			addOn.selected_cart_line_id,
			() => {
				setBusy(false);
				load();
			},
			(message: string) => {
				setBusy(false);
				ShowNotification(message, "error");
				load();
			},
			() => logoutUser(router),
		);
	};

	const handleRemove = async (lineId: string) => {
		setBusy(true);

		await deletePosCartLineApi(
			lineId,
			() => {
				setBusy(false);
				// Availability changes when a reserved unit returns to the floor.
				// Reloading also refreshes recommendation counts, so removing an
				// add-on through the line's trash action immediately makes its
				// checkbox selectable again.
				load();
			},
			(message: string) => {
				setBusy(false);
				ShowNotification(message, "error");
			},
			() => logoutUser(router),
		);
	};

	const warrantyLine = lines.find(
		(line) => line.cart_draft_line_id === warrantyLineId,
	);
	const noteLine = lines.find(
		(line) => line.cart_draft_line_id === noteLineId,
	);
	const grandTotal = rows.find((row) => row.emphasis === "total");
	const balanceDueMinor =
		rows.find((row) => row.key === "balance_due")?.amount ??
		rows.find((row) => row.key === "grand_total")?.amount ??
		0;

	return (
		<aside
			style={{ width: posLayout.cartWidth }}
			className="flex min-h-0 flex-none flex-col border-l border-[#DFE6E2] bg-white"
		>
			<div className="flex flex-none items-center justify-between px-4 pb-[10px] pt-4">
				<div className="flex items-baseline gap-[9px]">
					<span className="text-[17px] font-extrabold tracking-[-0.02em] text-[#101614]">
						Order
					</span>
					<span className="font-plex-mono text-[12px] text-[#8A968F]">
						{posItemsLabel(lines.length)}
					</span>
				</div>

				{/* §7.7: park this customer and serve another. The units stay
				    reserved, which is the point of holding rather than
				    abandoning. */}
				{lines.length > 0 && (
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={cartLocked || agreementLocked}
						onClick={() => setOpenLineItemOpen(true)}
							className="h-[38px] rounded-[10px] border border-[#DFE6E2] bg-white px-3 text-[13px] font-bold text-[#22302B] hover:bg-[#F2F5F3] disabled:opacity-50"
						>
							+ Open item
						</button>
						<button
							type="button"
							disabled={cartLocked || !cartId}
							onClick={handleHold}
							className="flex h-[38px] items-center gap-[7px] rounded-[10px] border border-[#DFE6E2] bg-white px-3 text-[13px] font-bold text-[#22302B] transition-colors hover:bg-[#F2F5F3] disabled:opacity-50"
						>
							<svg
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden
							>
								<path d="M5 3h11l3 3v15H5z" />
								<path d="M9 3v6h6" />
							</svg>
							Hold order
						</button>
					</div>
				)}
			</div>

			{layaway && (
				<div
					role="status"
					className="mx-4 mb-2 flex flex-none flex-col gap-[2px] rounded-[12px] border border-[#E7D3AE] bg-[#FBF5EA] px-3 py-[9px] text-[12.5px] text-[#7A5410]"
				>
					<span className="font-extrabold">{`Layaway ${layaway.layaway_no}`}</span>
					<span>
						{`Paid $${layaway.paid_amount} of $${layaway.original_amount}. The machines, prices and charges were agreed with the deposit and are locked here; payments are taken on the Layaways screen.`}
					</span>
				</div>
			)}

			{restored && lines.length > 0 && (
				<div className="mx-4 mb-2 flex flex-none items-center gap-2 rounded-[12px] border border-[#BFE3CD] bg-[#F3F9F5] px-3 py-[9px] text-[12.5px] font-semibold text-[#0B4A2A]">
					<svg
						width="15"
						height="15"
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
					Draft restored — this cart was still here from earlier.
				</div>
			)}

			{held.length > 0 && (
				<div className="mx-4 mb-2 flex flex-none flex-col gap-[6px]">
					<span className="text-[11.5px] font-bold tracking-[0.08em] text-[#8A968F]">
						{`${held.length} HELD ORDER${held.length === 1 ? "" : "S"}`}
					</span>
					<div className="pos-noscrollbar flex gap-2 overflow-x-auto pb-1">
						{held.map((cart) => (
							<button
								type="button"
								key={cart.cart_draft_id}
								disabled={cartLocked}
								onClick={() => handleResume(cart.cart_draft_id)}
								className="flex h-10 flex-none items-center gap-2 whitespace-nowrap rounded-[10px] border border-[#DFE6E2] bg-[#F7FAF8] px-3 text-[13px] font-bold text-[#22302B] hover:border-[#0F6B37] hover:bg-[#E7F2EB] disabled:opacity-50"
							>
								{cart.name ?? "Held"}
								<span className="font-plex-mono text-[11px] text-[#8A968F]">
									{cart.line_count}
								</span>
							</button>
						))}
					</div>
				</div>
			)}

			{/* Lines and totals share one scroll region, so a short till never
			    clips the total - it moves down the rail instead. Only Checkout
			    itself is pinned, below. */}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<div className="flex min-h-[120px] flex-none flex-col gap-[10px] px-4 pb-3">
					{loading ? (
						<div className="grid place-items-center py-14">
							<LoaderComponent />
						</div>
					) : lines.length === 0 ? (
						<div className="flex flex-col items-center gap-[6px] rounded-[16px] border border-dashed border-[#DFE6E2] bg-[#FAFCFB] px-5 py-11">
							<svg
								width="28"
								height="28"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#B9CEC2"
								strokeWidth="1.9"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden
							>
								<path d="M3 5h2l2.4 11.2A2 2 0 009.36 18h8.2a2 2 0 001.96-1.6L21 8H6" />
								<circle cx="10" cy="21" r="1.2" />
								<circle cx="18" cy="21" r="1.2" />
							</svg>
							<span className="text-[15.5px] font-bold text-[#22302B]">
								Cart is Empty!
							</span>
							<span className="text-center text-[13px] text-[#8A968F]">
								Scan a tag, or choose a unit from a product.
							</span>
						</div>
					) : (
						lines
							.filter((line) => !line.add_on_for_line_id)
							.map((line) => (
								<PosUnitCartLine
									key={line.cart_draft_line_id}
									line={line}
									disabled={cartLocked || agreementLocked}
									allowBelowList={allowBelowList}
									onPriceChange={(lineId, price) =>
										patchLine(lineId, {
											selling_price: price,
										})
									}
									onRemove={handleRemove}
									onWarranty={setWarrantyLineId}
									onNote={setNoteLineId}
									onAddOns={handleAddOns}
									onSerializedAddOn={handleSerializedAddOn}
								/>
							))
					)}
				</div>

				<div className="mt-auto flex flex-none flex-col">
					{/* CHK-06 / P9 / A35. Order-level, so above the breakup and
					    below the lines - and only once there is an order to
					    charge for. */}
					{lines.length > 0 && (
						<PosOrderCharges
							charges={charges}
							disabled={cartLocked || agreementLocked}
							onChange={handleChargeChange}
							onCommit={handleChargeCommit}
						/>
					)}

					{rows.length > 0 && (
						<div className="flex flex-col gap-[6px] border-t border-[#E6EBE8] bg-[#FBFCFB] px-4 pb-[14px] pt-3">
							{/* The same component the Invoice Detail modal and
							    the printed invoice render, from the same rows
							    (Rule E, A48, F-04). */}
							<div className="rounded-[14px] border border-[#E6EBE8] bg-white px-3 py-[10px]">
								<PriceBreakup rows={rows} variant="till" />
							</div>
						</div>
					)}
				</div>
			</div>

			{cartId && lines.length > 0 && (
				<div className="flex flex-none flex-col gap-[10px] border-t border-[#E6EBE8] bg-white px-4 pb-[14px] pt-3 shadow-[0_-6px_18px_rgba(16,22,20,.05)]">
					{/* A layaway is already an agreement: it is not quoted again or put on a
					    second layaway. */}
					{!agreementLocked && (
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							disabled={cartLocked}
							onClick={() => {
								commitCharges.flush();
								router.push(
									`${quotationsRoute}?cart_id=${cartId}`,
								);
							}}
							className="h-10 rounded-[10px] border border-[#B9CEC2] bg-white px-3 text-[13px] font-bold text-[#0F6B37] hover:bg-[#F0F8F3] disabled:opacity-50"
						>
							Save quotation
						</button>
						<button
							type="button"
							disabled={cartLocked}
							onClick={() => {
								commitCharges.flush();
								router.push(
									`${layawaysRoute}?cart_id=${cartId}`,
								);
							}}
							className="h-10 rounded-[10px] border border-[#B9CEC2] bg-white px-3 text-[13px] font-bold text-[#0F6B37] hover:bg-[#F0F8F3] disabled:opacity-50"
						>
							Layaway / deposit
						</button>
					</div>
					)}
					{/* P18 / A42 / D23: this opens the shipping step. It never
					    answers "Please select shipping address first!" and
					    stops, which is what made a walk-in unservable. */}
					<button
						type="button"
						disabled={cartLocked}
						onClick={() => {
							// ! Any charge still sitting in the debounce goes
							// ! now. Checkout bills from the cart the server
							// ! holds, so an unsent delivery charge would be a
							// ! delivery nobody was billed for.
							commitCharges.flush();
							setCheckoutOpen(true);
						}}
						className="flex h-14 w-full items-center justify-between gap-3 rounded-[14px] bg-[#0F6B37] px-5 text-white shadow-[0_6px_18px_rgba(15,107,55,.26)] transition-colors hover:bg-[#0A522A] disabled:bg-[#C9D3CE] disabled:shadow-none"
					>
						<span className="text-[17px] font-extrabold tracking-[-0.01em]">
							Continue to Checkout
						</span>
						<span
							aria-hidden
							className="flex items-center gap-2 text-[17px] font-extrabold"
						>
							{grandTotal
								? `${currencySign} ${(Math.abs(grandTotal.amount) / 100).toFixed(2)}`
								: ""}
							<svg
								width="19"
								height="19"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.6"
								strokeLinecap="round"
							>
								<path d="M5 12h13M13 6l6 6-6 6" />
							</svg>
						</span>
					</button>
				</div>
			)}

			{/* CHK-22 / P22: the invoice number stays on screen and stays
			    reachable. It used to appear only in a modal that became
			    unreachable the moment it was dismissed. */}
			{lastInvoice && (
				<div className="flex flex-none items-center gap-3 border-t border-[#E6EBE8] bg-[#F3F9F5] px-4 py-3">
					<span className="text-[13.5px] font-bold text-[#22302B]">
						{`Invoice #${lastInvoice.invoice_id}`}
					</span>
					<span className="ml-auto text-[15px] font-extrabold text-[#0F6B37]">
						{`${currencySign} ${lastInvoice.grand_total}`}
					</span>

					{/* What makes keeping the footer worthwhile: the paperwork is
					    reachable again once the modal has been dismissed. */}
					<button
						type="button"
						onClick={() => setDocumentsOpen(true)}
						className="flex-none rounded-[10px] border border-[#DFE6E2] bg-white px-3 py-[6px] text-[12.5px] font-bold text-[#22302B] transition-colors hover:bg-[#F2F5F3]"
					>
						Documents
					</button>
				</div>
			)}

			{checkoutOpen && cartId && (
				<PosCheckoutFlow
					isOpen={checkoutOpen}
					onClose={() => setCheckoutOpen(false)}
					cartId={cartId}
					/* ! The figure the payment step reconciles against, taken
					   ! from the same breakup this section prints. Recomputing
					   ! it there would be a second opinion on what the sale
					   ! costs, and the two would drift. */
					amountDueMinor={Math.max(0, balanceDueMinor)}
					unusedExchangeCreditMinor={Math.max(0, -balanceDueMinor)}
					layaway={layaway}
					/* ! Attaching a reseller / tax-exempt customer (or swapping
					   ! back to retail) re-runs the breakup so this panel's Sales
					   ! Tax row - and the amountDueMinor the payment step
					   ! reconciles against - track the customer now on the cart. */
					onCustomerChanged={load}
					onCompleted={(invoice) => {
						setLastInvoice(invoice);
						// IB-04: the paperwork, offered while the customer is
						// still standing at the counter.
						setDocumentsOpen(true);
						ShowNotification(
							`Invoice #${invoice.invoice_id} created`,
							"success",
						);
						load();
					}}
				/>
			)}

			{lastInvoice && documentsOpen && (
				<PosSaleDocuments
					isOpen
					onClose={() => setDocumentsOpen(false)}
					invoiceId={lastInvoice.invoice_id}
					grandTotal={`${currencySign} ${lastInvoice.grand_total}`}
					fulfilment={lastInvoice.fulfilment}
					invoice={lastInvoice.document ?? null}
				/>
			)}

			{/* CHK-05. Cover is chosen per machine: a customer buying a fridge
			    and a dryer may want it on one and not the other. */}
			{warrantyLineId && (
				<WarrantyModal
					isOpen
					warrantiesList={warrantyLine?.available_warranties ?? []}
					onClose={() => setWarrantyLineId(null)}
					itemPrice={Number(warrantyLine?.selling_price ?? 0)}
					itemName={warrantyLine?.product.name}
					onRemove={() => {
						patchLine(warrantyLineId, {
							extended_warranty_id: null,
						});
						setWarrantyLineId(null);
					}}
					selectedWarranty={
						warrantyLine?.extended_warranty
							? {
									duration:
										warrantyLine.extended_warranty
											.warranty_title,
									price: Number(
										warrantyLine.extended_warranty.price,
									),
								}
							: null
					}
					setSelectedWarranty={(chosen: {
						duration: string;
						price: number;
					}) => {
						// The modal answers with the plan's title; the line is
						// stored by id, so the id is looked back up here rather
						// than the title being persisted.
						const plan = (
							warrantyLine?.available_warranties ?? []
						).find(
							(option) =>
								option.warranty_title === chosen.duration,
						);

						if (plan) {
							patchLine(warrantyLineId, {
								extended_warranty_id: String(plan.warranty_id),
							});
						}
					}}
				/>
			)}

			<PosOpenLineItemModal
				isOpen={openLineItemOpen}
				onClose={() => setOpenLineItemOpen(false)}
				onAdd={handleOpenLineItem}
			/>

			{/* The order's own note is taken at checkout; this one prints under
			    the machine it belongs to (P5, CHK-01). */}
			{noteLineId && (
				<AdditionalNoteModal
					isOpen
					title={`Note — ${noteLine?.product.name ?? "this machine"}`}
					onClose={() => setNoteLineId(null)}
					note={noteLine?.additional_note ?? ""}
					// ! One write, when Save is pressed. This was `setNote`,
					// ! handed to the textarea's `onChange`, so every character
					// ! typed was its own `PATCH` and the box rendered whatever
					// ! the server last echoed back rather than what was typed.
					onSave={(value) =>
						patchLine(noteLineId, { additional_note: value })
					}
				/>
			)}
		</aside>
	);
};

export default PosUnitCartSection;
