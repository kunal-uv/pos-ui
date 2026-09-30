import { UserModel } from "./";

export interface AddOnModel {
	add_on_id: string;
	name: string;
	icon?: string;
	price: string;
	inventory_tracked: boolean;
	stock_quantity: number;
	created_by_id: string;
	created_by: UserModel;
	created_at: Date;
	is_disabled: boolean;
	is_deleted: boolean;
}
