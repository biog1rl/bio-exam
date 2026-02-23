export const PERMISSION_DOMAINS = {
  users: { actions: ['read', 'edit', 'invite', 'view_roles'] as const },
  rbac: { actions: ['read', 'write'] as const },
  settings: { actions: ['manage'] as const },
  tests: { actions: ['read', 'write', 'manage_assignments'] as const },
} as const;

export type PermissionDomain = keyof typeof PERMISSION_DOMAINS;
export type ActionOf<D extends PermissionDomain> =
  typeof PERMISSION_DOMAINS[D]['actions'][number];

type PermissionKeyByDomain = {
  [D in PermissionDomain]:
    `${D}.${typeof PERMISSION_DOMAINS[D]['actions'][number]}`
}[PermissionDomain];

export type PermissionKey = PermissionKeyByDomain;
