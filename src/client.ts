import type { PosTenant } from "./types";

export class PosClient {
	constructor(
		private readonly apiUrl: string,
		private readonly tenant: PosTenant,
		private readonly storeId: string,
		private readonly token: string,
		private readonly onUnauthorized?: () => void,
	) {}

	async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const endpoint = `${this.apiUrl.replace(/\/$/, "")}/v1${path}`;
		let response: Response;
		try {
			response = await fetch(endpoint, {
				...init,
				headers: {
					accept: "application/json",
					authorization: `Bearer ${this.token}`,
					"x-pos-tenant": this.tenant,
					"x-pos-store": this.storeId,
					...(init.body ? { "content-type": "application/json" } : {}),
					...init.headers,
				},
			});
		} catch {
			throw new Error(`The shared POS service is unavailable at ${this.apiUrl}. Start shared-pos-service and verify NEXT_PUBLIC_POS_API_URL.`);
		}
		const body = await response.json().catch(() => null) as { data?: T; error?: string } | null;
		if (response.status === 401) this.onUnauthorized?.();
		if (!response.ok) throw new Error(body?.error ?? `POS request failed (${response.status})`);
		return body?.data as T;
	}
}
