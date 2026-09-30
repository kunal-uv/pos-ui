import { ItemModel } from "./item_model";
import { CustomAttributeModel } from "./custom_attribute_model";
import { UserModel } from "./user_model";

export interface ItemCustomAttribute {
	item_custom_attribute_id: bigint;
	item_id: bigint;
	custom_attribute_id: bigint;
	item: ItemModel[];
	custom_attribute: CustomAttributeModel;
	attribute_value: string;
	created_by_id: bigint;
	created_by: UserModel;
	created_at: Date;
	is_deleted: boolean;
	is_disabled: boolean;
}
