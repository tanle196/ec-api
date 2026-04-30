export interface CurrentUser {
  id?: string;
  email: string;
  fullName?: string;
  avatar?: string;
  roles: string[];
  permissions: string[];
}
