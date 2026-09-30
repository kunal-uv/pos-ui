"use client";

import React, { useState } from "react";
import { PosHeader } from "./components/custom/pos_header";
import { PosUnitCartSection } from "./components/custom/pos_unit_cart_section";
import { PosUnitProductSection } from "./components/custom/pos_unit_product_section";
import { setPosPlatform, type PosPlatform } from "./platform";

interface Props {
	platform: PosPlatform;
}

/**
 * The till, as Appliance Outlet built it.
 *
 * Three columns under one header: the category rail, the product grid, and the
 * ticket. Each column owns its own scroll and nothing scrolls the page itself,
 * so the checkout button and the search box stay where the cashier's hands
 * expect them however long the order gets.
 *
 * The host supplies its backend, brand and customer form through `platform`.
 */
export const PosTill = ({ platform }: Props) => {
	// Registered during render, before any child reads it. Idempotent.
	setPosPlatform(platform);
	// Bumped whenever the grid puts a unit in the cart, so the panel reloads
	// from the server rather than trying to guess what changed.
	const [refreshToken, setRefreshToken] = useState(0);

	return (
		<main className="pos-root flex h-screen w-full flex-col overflow-hidden font-manrope">
			<PosHeader />
			<div className="flex min-h-0 flex-1">
				<PosUnitProductSection
					onLineAdded={() => setRefreshToken((value) => value + 1)}
				/>
				<PosUnitCartSection refreshToken={refreshToken} />
			</div>
		</main>
	);
};

export default PosTill;
