import { UserModel } from "./user_model";

export interface WarrantyModel {
	warranty_id: string;
	warranty_title: string;
	price: number | string;
	min_price: number | string;
	max_price: number | string;
	duration_months?: number | null;
	warranty_kind?: "base" | "extended";
	created_by_id: string;
	created_by: UserModel;
	created_at: Date;
	is_disabled: boolean;
	is_deleted: boolean;
}
