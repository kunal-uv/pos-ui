import { CustomerModel, CartModel } from "./";

export interface LocationModel {
    location_id: string;
    created_at?: Date;
    updated_at?: Date;
    lat?: string;
    long?: string;
    address: string;
    name: string;
    contact_no?: string;
    type: string;
    carts: CartModel[];
    customers: CustomerModel[];
    created_customers: CustomerModel[];
}
