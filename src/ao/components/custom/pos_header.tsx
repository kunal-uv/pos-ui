"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCookie } from "cookies-next";
import { useFullscreen } from "@mantine/hooks";
import {
	appName,
	dashboardRoute,
	logoutUser,
	nameConstant,
	userNameConstant,
} from "../../utils";
import { LogoutConfirmDialog } from "./logout_confirm_dialog";
import { posInitials, posLayout } from "./pos_design";

/**
 * The till's own top bar.
 *
 * ! There is no Drafts button. It opened a modal with one dead Save button in
 * ! it, from before held orders existed; the cart rail now lists the real ones
 * ! from `GET /pos/carts/held` and resumes them (§7.7, CHK-24). A second, empty
 * ! door to the same idea is worse than no door.
 */
export const PosHeader = () => {
	const router = useRouter();
	const { toggle, fullscreen } = useFullscreen();
	// Read after mount: cookies and localStorage are not available while the
	// server renders, and reading them during render would mismatch hydration.
	const [operator, setOperator] = useState<string>("");
	const [location, setLocation] = useState<string>("");
	const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

	useEffect(() => {
		const name =
			getCookie(nameConstant) ?? getCookie(userNameConstant) ?? "";

		setOperator(String(name));
		setLocation(localStorage.getItem("selected_location") ?? "");
	}, []);

	return (
		<>
			<header
				style={{ height: posLayout.headerHeight }}
				className="flex flex-none items-center gap-3 border-b border-[#DFE6E2] bg-white px-4"
			>
				<Link
					href={dashboardRoute}
					className="flex h-[38px] items-center gap-2 rounded-[10px] border border-[#DFE6E2] bg-[#F7FAF8] py-0 pl-[6px] pr-3 transition-colors hover:bg-[#EDF1EF]"
				>
					<span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[#0F6B37] text-white">
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.4"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<path d="M15 18l-6-6 6-6" />
						</svg>
					</span>
					<span className="text-[13.5px] font-bold tracking-[-0.01em] text-[#101614]">
						Dashboard
					</span>
				</Link>

				<div className="flex items-baseline gap-2 pl-1">
					<span className="text-[16px] font-extrabold tracking-[-0.02em] text-[#101614]">
						{appName}
					</span>
				</div>

				<div className="flex-1" />

				{operator && (
					<div className="mr-1 flex items-center gap-2 border-r border-[#E6EBE8] pr-1">
						<span className="grid h-[28px] w-[28px] place-items-center rounded-full bg-[#E7F2EB] text-[11px] font-extrabold text-[#0F6B37]">
							{posInitials(operator)}
						</span>
						<div className="flex flex-col pr-1 leading-[1.15]">
							<span className="text-[12.5px] font-bold text-[#101614]">
								{operator}
							</span>
							{location && (
								<span className="text-[10.5px] text-[#6B7A74]">
									{location}
								</span>
							)}
						</div>
					</div>
				)}

				<button
					type="button"
					onClick={toggle}
					title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
					aria-label={
						fullscreen ? "Exit fullscreen" : "Enter fullscreen"
					}
					className="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-[#DFE6E2] bg-[#F7FAF8] transition-colors hover:bg-[#EDF1EF]"
				>
					{fullscreen ? (
						<svg
							width="19"
							height="19"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#22302B"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<path d="M9 3v6H3" />
							<path d="M15 21v-6h6" />
							<path d="M3 9l7-7" />
							<path d="M21 15l-7 7" />
						</svg>
					) : (
						<svg
							width="19"
							height="19"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#22302B"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<path d="M15 3h6v6" />
							<path d="M9 21H3v-6" />
							<path d="M21 3l-7 7" />
							<path d="M3 21l7-7" />
						</svg>
					)}
				</button>

				<button
					type="button"
					onClick={() => setLogoutConfirmOpen(true)}
					className="flex h-[38px] items-center gap-2 rounded-[10px] bg-[#0F6B37] px-4 text-[13.5px] font-bold text-white transition-colors hover:bg-[#0A522A]"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.1"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden
					>
						<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
						<path d="M16 17l5-5-5-5" />
						<path d="M21 12H9" />
					</svg>
					Logout
				</button>
			</header>
			<LogoutConfirmDialog
				isOpen={logoutConfirmOpen}
				onClose={() => setLogoutConfirmOpen(false)}
				onConfirm={() => logoutUser(router)}
			/>
		</>
	);
};

export default PosHeader;
