import { CartModel, CustomerModel, UserModel, InvoiceItemModel } from "./";

export interface InvoiceModel {
    invoice_id: string;
    cart_id?: string;
    payment_method?: string;
    transaction_id?: string;
    transaction_time?: Date;
    transaction_detail?: Record<string, any>;
    delivery_time?: Date;
    delivery_method?: string;
    delivery_note?: string;
    total_payable_amount?: string;
    total_selling_amount?: string;
    sold_time?: Date;
    customer_id?: string;
    salesperson_id?: string;
    created_at?: Date;
    cart?: CartModel;
    customer?: CustomerModel;
    salesperson?: UserModel;
    invoice_items: InvoiceItemModel[];
}
