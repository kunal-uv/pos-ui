export interface PermissionModel {
	entity: string;
	permissions: Array<string>;
}

export interface SelectedPermissionModel {
	entity: string;
	permissions: Array<PermissionItemModel>;
	checked: boolean;
}

export interface PermissionItemModel {
	permission: string;
	checked: boolean;
}
