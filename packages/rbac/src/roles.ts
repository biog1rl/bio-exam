import type { ActionOf, PermissionDomain } from './domains';

// '*' — все действия домена
export type RoleGrant = Partial<{
  [D in PermissionDomain]: Array<ActionOf<D> | '*'>
}>;

export type RoleConfig = {
  key: RoleKey;
  name: string;
  description?: string;
  color?: string;
  order?: number;
  inherits?: RoleKey[];
  grants: RoleGrant;
};

export const ROLE_REGISTRY = {
  admin: {
    key: 'admin',
    name: 'Администратор',
    grants: { users: ['*'], rbac: ['*'], settings: ['*'], tests: ['*'], groups: ['*'] },
    order: 0,
  },
  user: {
    key: 'user',
    name: 'Пользователь',
    grants: { users: ['read'] },
    order: 10,
  },
} as const satisfies Record<string, Omit<RoleConfig, 'key'> & { key: string }>;

export type RoleKey = keyof typeof ROLE_REGISTRY;

export const ROLE_KEYS = Object.keys(ROLE_REGISTRY) as RoleKey[];

export const ROLES_LIST: ReadonlyArray<RoleConfig> =
  (Object.values(ROLE_REGISTRY) as Array<Omit<RoleConfig, 'key'> & { key: RoleKey }>)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999)) as ReadonlyArray<RoleConfig>;

// Перегрузка: можно передавать и raw string (вернём key как есть, если не найдём)
export function roleDisplayName(key: RoleKey): string;
export function roleDisplayName(key: string): string;
export function roleDisplayName(key: string): string {
  const k = key as RoleKey;
  return ROLE_REGISTRY[k]?.name ?? key;
}
