import { ItemModel, UserModel } from "./";

/**
 * One node of the category tree. `parent_id` null means it is a root; there is
 * no fixed number of levels, so "Cooktop > Electric > 4-burner" and anything
 * deeper are the same shape.
 */
export interface CategoryModel {
    category_id: string;
    name: string;
    icon?: string;
    parent_id: string | null;
    created_by_id: string;
    created_by: UserModel;
    created_at: Date;
    is_disabled: boolean;
    is_deleted: boolean;
    items: ItemModel[];
    /** Present on the `tree=true` response, absent on the flat list. */
    children?: CategoryTreeNode[];
    /** How much sits under this node - drives the delete/disable warnings. */
    _count?: {
        children: number;
        items: number;
    };
}

export interface CategoryTreeNode extends CategoryModel {
    children: CategoryTreeNode[];
    /** 0 for a root, incrementing by one per level - used for indentation. */
    depth: number;
}
