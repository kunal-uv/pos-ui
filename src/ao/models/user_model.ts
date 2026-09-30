import {
	CartModel,
	CategoryModel,
	TagModel,
	CustomAttributeModel,
	AddOnModel,
	ItemModel,
	InvoiceModel,
	CustomerModel,
	RoleModel,
	ActivityLogModel,
} from "./";

export interface UserModel {
    user_id: string;
    name: string;
    phone?: string;
    email: string;
    username: string;
    password: string;
    type?: string;
    grade?: string;
    commission_percent?: string;
    /** §7: this person's overage rate, a percent of (sold - List). */
    overage_rate_percent?: string | null;
    ext_warranty_value?: string;
    designated_location?: string;
    created_at?: Date;
    updated_at?: Date;
    basic_pay?: string;
    role_id?: string;
	is_deleted?: boolean;
	is_disabled?: boolean;
    carts: CartModel[];
    categories: CategoryModel[];
    tags: TagModel[];
    custom_attributes: CustomAttributeModel[];
    add_ons: AddOnModel[];
    items: ItemModel[];
    invoices: InvoiceModel[];
    customers: CustomerModel[];
    roles_created: RoleModel[];
    role?: RoleModel;
    activity_logs: ActivityLogModel[];
}
