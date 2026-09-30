import { CartItemModel, CustomerModel, InvoiceModel, LocationModel, UserModel } from "./";

export interface CartModel {
    id:string
    cart_id: string;
    customer_id?: string;
    salesperson_id?: string;
    created_at?: Date;
    updated_at?: Date;
    total_selling_price?: string;
    total_payable_price?: string;
    cart_items: CartItemModel[];
    customer?: CustomerModel;
    location?: LocationModel;
    salesperson?: UserModel;
    invoices: InvoiceModel[];
}
