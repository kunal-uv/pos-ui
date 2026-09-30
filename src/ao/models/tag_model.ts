import { UserModel } from "./";

export interface TagModel {
    tag_id: string;
    name: string;
    created_by_id: string;
    created_by: UserModel;
    created_at: Date;
    is_disabled: boolean;
    is_deleted: boolean;
}
