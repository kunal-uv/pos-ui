/**
 * What a host admin plugs into the till.
 *
 * The till's components are Appliance Outlet's own, moved here unchanged.
 * Everything they used to import from the admin itself - the API calls, the
 * brand, the routes, the add-customer form - now comes through this registry,
 * so every host renders the same till against its own backend.
 *
 * `setPosPlatform` must run before the till renders; `<PosTill platform>` does
 * that for you. The shim modules (`utils/config`, `utils/network_utils`,
 * `constants/business_config`, ...) read from here through live bindings, so
 * component code keeps its original imports.
 */

import type { ComponentType } from "react";
import type { MantineColor } from "@mantine/core";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { BusinessConfig } from "./constants/business_config";

type Ok = (arg0: any) => void;
type Fail = (message: string) => void;
type FailAny = (arg0: any) => void;
type Logout = () => void;

/** The backend calls the till makes - same signatures as AO's network_utils. */
export interface PosApi {
	getCategoryTreeApi: (successCallback: Ok, errorCallback: FailAny, logoutCallback: Logout) => Promise<void>;
	getCustomerApi: (query: string | undefined, successCallback: Ok, errorCallback: FailAny, logoutCallback: Logout) => Promise<void>;
	upsertCustomerApi: (body: any, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	getPriceBreakupApi: (
		body: {
			lines: {
				msrp?: string | number | undefined;
				selling_price?: string | number | undefined;
				extended_warranty_price?: string | number | undefined;
				ehf_amount?: string | number | undefined;
			}[];
			delivery_charge?: string | number | undefined;
			removal_charge?: string | number | undefined;
			relocation_charge?: string | number | undefined;
			exchange_credit?: string | number | undefined;
			cart_draft_id?: string | undefined;
		},
		successCallback: Ok,
		errorCallback: Fail,
		logoutCallback: Logout,
	) => Promise<void>;
	getPosProductsApi: (query: string, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	getProductUnitsApi: (productId: string, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	addPosCartLineApi: (
		body: {
			serial?: string | undefined;
			inventory_unit_id?: string | undefined;
			cart_draft_id?: string | undefined;
			add_on_for_line_id?: string | undefined;
		},
		successCallback: Ok,
		errorCallback: Fail,
		logoutCallback: Logout,
	) => Promise<void>;
	getPosCartApi: (successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	updatePosCartLineApi: (
		lineId: string,
		body: {
			selling_price?: string | undefined;
			additional_note?: string | undefined;
			extended_warranty_id?: string | null | undefined;
			add_ons?: { add_on_id: string; price?: string | undefined; name?: string | undefined }[] | undefined;
		},
		successCallback: Ok,
		errorCallback: Fail,
		logoutCallback: Logout,
	) => Promise<void>;
	deletePosCartLineApi: (lineId: string, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	updatePosCartApi: (cartId: string, body: Record<string, unknown>, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	captureSignatureApi: (
		cartId: string,
		body: { signature_data: string; marketing_consent?: boolean | undefined },
		successCallback: Ok,
		errorCallback: Fail,
		logoutCallback: Logout,
	) => Promise<void>;
	getCustomerAddressesApi: (customerId: string, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	createCustomerAddressApi: (
		customerId: string,
		body: { street?: string | undefined; city?: string | undefined; region?: string | undefined; postal: string; label?: string | undefined },
		successCallback: Ok,
		errorCallback: Fail,
		logoutCallback: Logout,
	) => Promise<void>;
	posCheckoutApi: (body: { cart_draft_id: string; payment_method?: string | undefined }, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	getHeldCartsApi: (successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	holdCartApi: (cartId: string, name: string, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	resumeCartApi: (cartId: string, successCallback: Ok, errorCallback: Fail, logoutCallback: Logout) => Promise<void>;
	previewCommissionApi: (body: Record<string, unknown>, successCallback: Ok, errorCallback: FailAny, logoutCallback: Logout) => Promise<void>;
}

export interface PosPlatform {
	api: PosApi;
	business: BusinessConfig;
	/** Signs the operator out: clear the session, then send them to login. */
	logoutUser: (router: AppRouterInstance) => void;
	/** The admin's own create/edit-customer form, opened from checkout. */
	AddCustomerModal: ComponentType<any>;
	/** True while the admin is in dark mode. Called as a hook. */
	useDarkMode: () => boolean;
	/** Brand colour for the few Mantine wrappers that take one. */
	appColor?: MantineColor;
	routes?: { dashboard?: string; quotations?: string; layaways?: string };
	/** Cookies holding the signed-in operator's display name. */
	cookies?: { name?: string; userName?: string };
}

type Listener = (platform: PosPlatform) => void;
const listeners: Listener[] = [];

export let platform: PosPlatform | null = null;

/** The shims call this to learn about (re)registration. */
export const onPosPlatform = (listener: Listener) => {
	listeners.push(listener);
	if (platform) listener(platform);
};

export const setPosPlatform = (next: PosPlatform) => {
	if (platform === next) return;
	platform = next;
	for (const listener of listeners) listener(next);
};

export const requirePlatform = (): PosPlatform => {
	if (!platform) throw new Error("shared-pos-ui: render <PosTill platform={...}> before using the till.");
	return platform;
};
