/**
 * Shim for AO's `utils/config`: only what the till reads.
 *
 * The Mantine sizing values are AO's, verbatim, so every wrapper renders
 * exactly as it did in the admin. Brand, routes, cookie names and sign-out
 * belong to the host and arrive through `setPosPlatform` as live bindings.
 */

import { ActionIconVariant, InputVariant, MantineColor, MantineRadius, MantineSize } from "@mantine/core";
import moment from "moment";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { onPosPlatform, requirePlatform } from "../platform";

export let appName: string = "";
export let currencySign: string = "$";
export let appColorRGBA: MantineColor = "rgba(13, 110, 58, 1)";

export const textColorPrimaryLight: string = "#000";
export const textColorPrimaryDark: string = "#fff";
export const mantineH2Size: number = 18;
export const mantineSize: MantineSize = "md";
export const mantineButtonHeight: number = 36;
export const mantineRadius: MantineRadius = "md";
export const mantineButtonSize: MantineSize = "sm";
export const mantineButtonLoaderSize: MantineSize = "xs";
export const mantineSpaceWidth: MantineSize = "sm";
export const mantineSpaceHeight: MantineSize = "sm";
export const mantineActionIconSize: MantineSize = "lg";
export const mantineInputVariant: InputVariant = "filled";
export const mantineActionIconVariant: ActionIconVariant = "light";

/** Cookie constants */
export let nameConstant: string = "name";
export let userNameConstant: string = "username";

/** Routes */
export let dashboardRoute: string = "/";
export let quotationsRoute: string = "/quotations";
export let layawaysRoute: string = "/layaways";

onPosPlatform((platform) => {
	appName = platform.business.appName;
	currencySign = platform.business.currencySign;
	appColorRGBA = platform.appColor ?? "rgba(13, 110, 58, 1)";
	nameConstant = platform.cookies?.name ?? "name";
	userNameConstant = platform.cookies?.userName ?? "username";
	dashboardRoute = platform.routes?.dashboard ?? "/";
	quotationsRoute = platform.routes?.quotations ?? "/quotations";
	layawaysRoute = platform.routes?.layaways ?? "/layaways";
});

export const formatDateShort = (inputDate: any) =>
	moment(inputDate).format("DD MMM YYYY");

export const logoutUser = (router: AppRouterInstance) => requirePlatform().logoutUser(router);
