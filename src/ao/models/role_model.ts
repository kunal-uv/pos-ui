import { PermissionModel, UserModel } from "./";

export interface RoleModel {
    role_id: string;
    name: string;
    isAdmin: boolean;
    permission_entities: PermissionModel[];
    created_by_id: string;
    created_by: UserModel;
    created_at: Date;
    is_disabled: boolean;
    is_deleted: boolean;
    user_roles: UserModel[];
}
