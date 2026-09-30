import { CartModel, ItemModel } from "./";

export interface CartItemModel {
    cart_item_id: string;
    cart_id?: string;
    item_id: string;
    selling_price?: string;
    gst?: string;
    pst?: string;
    ehf_marr_fees?: string;
    extended_warranty?: string;
    payable_price?: string;
    created_at?: Date;
    updated_at?: Date;
    cart?: CartModel;
    item: ItemModel;
    quantity: number;
    nc_number?:string
}
