import { CategoryModel, UserModel, CartItemModel, InvoiceItemModel } from "./";
import { ItemCustomAttribute } from "./item_custom_attribute";

export interface ItemModel {
	custom_attributes: ItemCustomAttribute[];
    item_id: string;
    /** The single tree node this item sits at, at whatever depth. */
    category_id: string;
    category: CategoryModel;
    /**
     * Breadcrumb from root to that node, e.g. ["Cooktop","Electric","4-burner"].
     * Supplied by the list endpoint so tables need no extra lookups.
     */
    category_path?: string[];
    tag_ids: string[];
    add_ons: string[];
    name: string;
    internal_name?: string;
    description?: string;
    short_description?: string;
    sku?: string;
    barcode?: string;
    /** Serial of the stock unit this item became, resolved by the list endpoint. */
    serial?: string | null;
    images: string[];
    icon?: string;
    price: string;
    msrp: string;
    // stock_quantity: string;
    custom_attribute_ids: string[];
    created_by_id: string;
    created_by: UserModel;
    created_at: Date;
    is_disabled: boolean;
    is_deleted: boolean;
    cart_items: CartItemModel[];
    invoice_items: InvoiceItemModel[];
}
