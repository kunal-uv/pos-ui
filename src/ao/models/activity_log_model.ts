import { UserModel } from "./";

export interface ActivityLogModel {
    activity_log_id: string;
    action: "create" | "view" | "update" | "delete";
    action_entity:
        | "item_type"
        | "category"
        | "sub_category"
        | "tag"
        | "custom_attribute"
        | "add_on"
        | "item"
        | "role"
        | "user"
        | "invoice"
        | "customer"
        | "cart";
    action_entity_id: string;
    action_entity_name: string;
    performed_by_id: string;
    performed_by: UserModel;
    created_at: Date;
    is_deleted: boolean;
}
