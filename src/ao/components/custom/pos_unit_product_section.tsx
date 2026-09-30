"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebouncedCallback } from "@mantine/hooks";
import { LoaderComponent } from "../mantine";
import ShowNotification from "../mantine/show_notification";
import {
	addPosCartLineApi,
	getCategoryTreeApi,
	getPosProductsApi,
	logoutUser,
} from "../../utils";
import { CategoryTreeNode } from "../../models";
import { PosSerialPicker, type PickerUnit } from "./pos_serial_picker";
import { PosUnitTile, type PosTile } from "./pos_unit_tile";
import { posLayout, posTileColumns } from "./pos_design";
import { useBarcodeScanner } from "./use_barcode_scanner";

interface Props {
	/** Called after a unit reaches the cart, so the cart panel can refresh. */
	onLineAdded: () => void;
}

/** Sellable models at this node or anywhere beneath it, which is what selecting
 *  the node actually filters by (the grid expands the subtree server side). */
const subtreeCount = (
	node: CategoryTreeNode,
	counts: Map<string, number>,
): number =>
	(counts.get(String(node.category_id)) ?? 0) +
	(node.children ?? []).reduce(
		(total, child) => total + subtreeCount(child, counts),
		0,
	);

/**
 * ! `items-stretch`, not `items-start`. A two-line product name otherwise
 * ! leaves the tile beside it short, with its Choose unit button floating half
 * ! an inch higher than its neighbour's - and that button is aimed at with a
 * ! thumb, from standing.
 */
const tileGrid = "grid items-stretch";

/**
 * ! Inline, not a Tailwind arbitrary value, so `posLayout.tileMinWidth` and
 * ! `posLayout.tileGap` are the only place the tile size is written down. See
 * ! the note on `posLayout` for why an interpolated class name cannot work.
 */
const tileGridStyle = {
	gridTemplateColumns: posTileColumns,
	gap: posLayout.tileGap,
};

/**
 * A model with nothing sellable behind it.
 *
 * ! The server has already sorted these last; splitting them again here is what
 * ! draws the rule between the two blocks, and it keeps the grid right whatever
 * ! order a payload arrives in.
 */
const isOutOfStock = (tile: PosTile) => tile.available_count === 0;

const findNode = (
	nodes: CategoryTreeNode[],
	id: string,
): CategoryTreeNode | undefined => {
	for (const node of nodes) {
		if (String(node.category_id) === id) return node;

		const inChildren = findNode(node.children ?? [], id);

		if (inChildren) return inChildren;
	}

	return undefined;
};

/**
 * The POS grid, on units (POS-01 … POS-05, POS-15).
 *
 * Three ways a machine reaches the cart, and they converge on one endpoint:
 *
 *   1. **A scan.** The barcode carries the serial (Rule D), so one scan is one
 *      line with no picker and no confirmation - the salesperson has already
 *      told the system which machine by pointing the scanner at it (A19).
 *   2. **A typed serial**, which behaves identically. Same endpoint, same
 *      refusals (POS-02).
 *   3. **A tile**, which opens the serial picker, because a tile is several
 *      machines at several prices and one of them has to be chosen (POS-05).
 *
 * ! Nothing here adds "a product". There is no Add button on a tile and no
 * ! quantity anywhere, because the thing being sold exists once (trap T10).
 *
 * ! The rail's counts come from the grid's own endpoint, not from the category
 * ! tree's `_count.items`. That figure counts catalogue items, so a rail built
 * ! on it advertises eleven models and opens on an empty grid when none of the
 * ! eleven has a machine on the floor.
 */
export const PosUnitProductSection = ({ onLineAdded }: Props) => {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [tiles, setTiles] = useState<PosTile[]>([]);
	const [loading, setLoading] = useState(true);
	const [picker, setPicker] = useState<PosTile | null>(null);
	const [busy, setBusy] = useState(false);
	const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
	/** Sellable models per category, keyed by id - direct, not rolled up. */
	const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(
		new Map(),
	);
	const [floorCount, setFloorCount] = useState(0);
	// Ids from root down to the node being browsed; empty means no filter.
	const [categoryPath, setCategoryPath] = useState<string[]>([]);

	const load = useDebouncedCallback((query: string, categoryId?: string) => {
		setLoading(true);

		const params = [
			query ? `search=${encodeURIComponent(query)}` : "",
			categoryId ? `category_id=${categoryId}` : "",
		]
			.filter(Boolean)
			.join("&");

		getPosProductsApi(
			params,
			(data: {
				products: PosTile[];
				category_counts?: { category_id: string; count: number }[];
				total_count?: number;
			}) => {
				setTiles(data.products ?? []);
				setCategoryCounts(
					new Map(
						(data.category_counts ?? []).map((row) => [
							row.category_id,
							row.count,
						]),
					),
				);
				setFloorCount(data.total_count ?? 0);
				setLoading(false);
			},
			(message: string) => {
				ShowNotification(message, "error");
				setLoading(false);
			},
			() => logoutUser(router),
		).then();
	}, 250);

	const selectedCategoryId = categoryPath[categoryPath.length - 1];

	useEffect(() => {
		load(search, selectedCategoryId);
	}, [search, selectedCategoryId, load]);

	useEffect(() => {
		getCategoryTreeApi(
			(data: { categories?: CategoryTreeNode[] }) =>
				setCategoryTree(data.categories ?? []),
			() => {},
			() => logoutUser(router),
		).then();
	}, [router]);

	/**
	 * The one path into the cart.
	 *
	 * ! The server's refusal is shown verbatim. "Serial XYZ was sold on 08 Aug -
	 * ! Invoice 128" is a sentence a salesperson can act on; replacing it with
	 * ! "could not add item" throws away the only useful part (A30).
	 */
	const addToCart = useCallback(
		async (body: { serial?: string; inventory_unit_id?: string }) => {
			setBusy(true);

			await addPosCartLineApi(
				body,
				(data: { line: { serial: string } }) => {
					setBusy(false);
					ShowNotification(`${data.line.serial} added`, "success");
					setPicker(null);
					onLineAdded();
					// A sold machine leaves the floor, so the counts move.
					load(search, selectedCategoryId);
				},
				(message: string) => {
					setBusy(false);
					ShowNotification(message, "error");
				},
				() => logoutUser(router),
			);
		},
		[load, onLineAdded, router, search, selectedCategoryId],
	);

	// A scanner types fast and ends with Enter; this is the same path a typed
	// serial takes (POS-01, POS-02).
	useBarcodeScanner({
		onScan: (scanned: string) => {
			if (scanned.trim()) {
				addToCart({ serial: scanned.trim() });
			}
		},
	});

	/** The nodes from the root down to wherever we are browsing. */
	const trail = useMemo(() => {
		const nodes: CategoryTreeNode[] = [];

		for (const id of categoryPath) {
			const node = findNode(categoryTree, id);

			if (!node) break;

			nodes.push(node);
		}

		return nodes;
	}, [categoryTree, categoryPath]);

	/** The children of wherever we are - the chip row under the search box. */
	const subCategories =
		trail.length === 0 ? [] : (trail[trail.length - 1]?.children ?? []);

	const sellableTiles = useMemo(
		() => tiles.filter((tile) => !isOutOfStock(tile)),
		[tiles],
	);
	const outOfStockTiles = useMemo(() => tiles.filter(isOutOfStock), [tiles]);

	return (
		<>
			<nav
				style={{ width: posLayout.categoryRailWidth }}
				className="flex min-h-0 flex-none flex-col border-r border-[#DFE6E2] bg-white"
			>
				<div className="px-3 pb-2 pt-3 text-[10.5px] font-bold tracking-[0.1em] text-[#8A968F]">
					CATEGORIES
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto px-2 pb-3">
					{[null, ...categoryTree].map((node) => {
						const isAll = node === null;
						const id = isAll ? "" : String(node.category_id);
						const selected = isAll
							? categoryPath.length === 0
							: categoryPath[0] === id;
						const count = isAll
							? floorCount
							: subtreeCount(node, categoryCounts);

						return (
							<button
								type="button"
								key={isAll ? "all" : id}
								onClick={() => {
									setCategoryPath(isAll ? [] : [id]);
								}}
								className={`flex min-h-[34px] items-center justify-between gap-[6px] rounded-[9px] px-[10px] py-[6px] text-left text-[13px] ${
									selected
										? "bg-[#0F6B37] font-extrabold text-white"
										: "bg-transparent font-semibold text-[#22302B] hover:bg-[#F2F5F3]"
								}`}
							>
								<span className="line-clamp-2 leading-[1.25]">
									{isAll ? "All products" : node.name}
								</span>
								<span
									className={`flex-none rounded-[6px] px-[5px] py-px font-plex-mono text-[10px] ${
										selected
											? "bg-white/20 text-white"
											: "bg-[#EDF1EF] text-[#8A968F]"
									}`}
								>
									{count}
								</span>
							</button>
						);
					})}
				</div>
			</nav>

			<main className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex flex-none flex-col gap-[10px] bg-[#EDF1EF] px-3 pb-[10px] pt-3">
					<div className="relative flex h-[44px] min-w-0 items-center gap-[10px] rounded-[12px] border border-[#DFE6E2] bg-white px-3 focus-within:border-[#0F6B37]">
						<svg
							width="18"
							height="18"
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
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							onKeyDown={(event) => {
								// Enter on something that looks like a serial goes
								// straight to the cart; anything else just filters.
								if (event.key === "Enter" && search.trim()) {
									event.preventDefault();
									addToCart({ serial: search.trim() });
								}
							}}
							placeholder="Scan a tag, or type a serial, model number or product name"
							aria-label="Scan a tag, or type a serial, model number or product name"
							className="h-full min-w-0 flex-1 border-none bg-transparent text-[14.5px] font-medium text-[#101614] outline-none placeholder:text-[#8A968F]"
						/>
						{search && (
							<button
								type="button"
								aria-label="Clear search"
								onClick={() => setSearch("")}
								className="grid h-7 w-7 flex-none place-items-center rounded-[8px] bg-[#EDF1EF] hover:bg-[#E0E7E3]"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="#22302B"
									strokeWidth="2.4"
									strokeLinecap="round"
									aria-hidden
								>
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						)}
						<span className="flex flex-none items-center gap-[6px] overflow-hidden border-l border-[#E6EBE8] pl-[10px] font-plex-mono text-[10.5px] text-[#8A968F]">
							<span
								className={`inline-block h-[6px] w-[6px] rounded-full ${
									loading || busy
										? "bg-[#B76E00]"
										: "bg-[#17A24A]"
								}`}
							/>
							{loading || busy ? "WORKING…" : "SCANNER READY"}
						</span>
					</div>

					{(trail.length > 0 || subCategories.length > 0) && (
						<div className="flex min-h-[36px] items-center gap-2">
							{trail.length > 0 && (
								<div className="flex max-w-[42%] flex-none items-center gap-2">
									<button
										type="button"
										title="Up one level"
										aria-label="Up one level"
										onClick={() =>
											setCategoryPath(
												categoryPath.slice(0, -1),
											)
										}
										className="grid h-9 w-9 flex-none place-items-center rounded-[9px] border border-[#DFE6E2] bg-white hover:bg-[#F2F5F3]"
									>
										<svg
											width="17"
											height="17"
											viewBox="0 0 24 24"
											fill="none"
											stroke="#22302B"
											strokeWidth="2.3"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden
										>
											<path d="M15 18l-6-6 6-6" />
										</svg>
									</button>
									<div className="pos-noscrollbar flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto">
										{trail.map((node, index) => {
											const last =
												index === trail.length - 1;

											return (
												<React.Fragment
													key={String(
														node.category_id,
													)}
												>
													<button
														type="button"
														onClick={() =>
															setCategoryPath(
																categoryPath.slice(
																	0,
																	index + 1,
																),
															)
														}
														className={`h-8 whitespace-nowrap rounded-[8px] px-2 text-[12px] ${
															last
																? "bg-[#E7F2EB] font-extrabold text-[#0B4A2A]"
																: "bg-transparent font-semibold text-[#8A968F] hover:bg-[#F2F5F3]"
														}`}
													>
														{node.name}
													</button>
													{!last && (
														<span className="flex-none text-[12px] text-[#B9CEC2]">
															›
														</span>
													)}
												</React.Fragment>
											);
										})}
									</div>
									<span className="h-[20px] w-px flex-none bg-[#DFE6E2]" />
								</div>
							)}

							{subCategories.length > 0 && (
								<div className="pos-noscrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto py-[2px]">
									{subCategories.map((node) => (
										<button
											type="button"
											key={String(node.category_id)}
											onClick={() =>
												setCategoryPath([
													...categoryPath,
													String(node.category_id),
												])
											}
											className="flex h-9 items-center gap-[6px] whitespace-nowrap rounded-[18px] border border-[#DFE6E2] bg-white py-0 pl-3 pr-[10px] text-[12.5px] font-semibold text-[#22302B] hover:border-[#0F6B37] hover:bg-[#F3F9F5]"
										>
											{node.name}
											<span className="font-plex-mono text-[10px] text-[#8A968F]">
												{subtreeCount(
													node,
													categoryCounts,
												)}
											</span>
											{(node.children ?? []).length >
												0 && (
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="#0F6B37"
													strokeWidth="2.6"
													strokeLinecap="round"
													strokeLinejoin="round"
													aria-hidden
												>
													<path d="M9 18l6-6-6-6" />
												</svg>
											)}
										</button>
									))}
								</div>
							)}
						</div>
					)}
				</div>

				<div className="pos-noscrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3">
					{loading ? (
						<div className="grid place-items-center py-20">
							<LoaderComponent />
						</div>
					) : tiles.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-20 text-[#8A968F]">
							<span className="text-[17px] font-bold text-[#22302B]">
								Nothing on the floor matches that
							</span>
							<span className="text-[14px]">
								Try a shorter model number, or clear the
								category filter.
							</span>
						</div>
					) : (
						<div className="flex flex-col gap-[10px]">
							{sellableTiles.length > 0 && (
								<div className={tileGrid} style={tileGridStyle}>
									{sellableTiles.map((tile) => (
										<PosUnitTile
											key={tile.product_id}
											tile={tile}
											onChooseUnit={setPicker}
										/>
									))}
								</div>
							)}

							{/* ! Labelled, not merely sorted. A block of tiles
							    that refuse to open needs a heading saying so,
							    or the first one tapped reads as a broken till
							    rather than as a machine the shop has not
							    got. */}
							{outOfStockTiles.length > 0 && (
								<>
									<div className="flex items-center gap-3">
										<span className="flex-none text-[11px] font-extrabold tracking-[0.09em] text-[#8A968F]">
											OUT OF STOCK
										</span>
										<span className="h-px flex-1 bg-[#DFE6E2]" />
									</div>

									<div
										className={tileGrid}
										style={tileGridStyle}
									>
										{outOfStockTiles.map((tile) => (
											<PosUnitTile
												key={tile.product_id}
												tile={tile}
												onChooseUnit={setPicker}
											/>
										))}
									</div>
								</>
							)}
						</div>
					)}
				</div>
			</main>

			<PosSerialPicker
				isOpen={picker !== null}
				onClose={() => setPicker(null)}
				productId={picker?.product_id ?? null}
				productName={picker?.name ?? ""}
				busy={busy}
				onChoose={(unit: PickerUnit) => {
					if (!busy) {
						addToCart({ inventory_unit_id: unit.inventory_unit_id });
					}
				}}
			/>
		</>
	);
};

export default PosUnitProductSection;
