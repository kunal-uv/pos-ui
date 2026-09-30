import { ItemModel } from "./";

export interface InvoiceItemModel {
    invoice_item_id: string;
    invoice_id?: string;
    item_id: string;
    selling_price?: string;
    gst?: string;
    pst?: string;
    ehf_marr_fees?: string;
    extended_warranty?: string;
    payable_price?: string;
    created_at?: Date;
    updated_at?: Date;
    salesperson_id?: string;
    invoice?: InvoiceItemModel;
    item: ItemModel;
}
