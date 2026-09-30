/**
 * Shim for AO's `utils/network_utils`: every call is forwarded to the host's
 * `PosPlatform.api`, so the till's components keep their original imports.
 */
import { requirePlatform, type PosApi } from "../platform";

const call = <K extends keyof PosApi>(name: K): PosApi[K] =>
	((...args: unknown[]) => (requirePlatform().api[name] as (...a: unknown[]) => Promise<void>)(...args)) as PosApi[K];

export const getCategoryTreeApi = call("getCategoryTreeApi");
export const getCustomerApi = call("getCustomerApi");
export const upsertCustomerApi = call("upsertCustomerApi");
export const getPriceBreakupApi = call("getPriceBreakupApi");
export const getPosProductsApi = call("getPosProductsApi");
export const getProductUnitsApi = call("getProductUnitsApi");
export const addPosCartLineApi = call("addPosCartLineApi");
export const getPosCartApi = call("getPosCartApi");
export const updatePosCartLineApi = call("updatePosCartLineApi");
export const deletePosCartLineApi = call("deletePosCartLineApi");
export const updatePosCartApi = call("updatePosCartApi");
export const captureSignatureApi = call("captureSignatureApi");
export const getCustomerAddressesApi = call("getCustomerAddressesApi");
export const createCustomerAddressApi = call("createCustomerAddressApi");
export const posCheckoutApi = call("posCheckoutApi");
export const getHeldCartsApi = call("getHeldCartsApi");
export const holdCartApi = call("holdCartApi");
export const resumeCartApi = call("resumeCartApi");
export const previewCommissionApi = call("previewCommissionApi");
