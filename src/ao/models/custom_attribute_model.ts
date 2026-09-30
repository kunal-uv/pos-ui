import { UserModel } from "./user_model";

export interface CustomAttributeModel {
    custom_attribute_id: string;
    name: string;
    type: "number" | "percentage" | "string";
    created_by_id: string;
    created_by: UserModel;
    created_at: Date;
    is_disabled: boolean;
    is_deleted: boolean;
    default_value: string;
    is_tax: boolean;
    tax_type: string;
}
