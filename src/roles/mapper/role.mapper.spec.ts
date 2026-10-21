import { RoleMapper } from './role.mapper';

describe('RoleMapper', () => {
  const role = {
    id: 'role-1',
    name: 'admin',
    description: 'Administrator',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    permissions: [
      {
        id: 'perm-1',
        module: 'user',
        action: 'read',
        description: 'Read users',
        isSystem: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        roles: [],
      },
    ],
    users: [],
  };

  it('maps a role entity to the public response shape', () => {
    expect(RoleMapper.toResponse(role as never)).toEqual({
      id: 'role-1',
      name: 'admin',
      description: 'Administrator',
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: [
        {
          id: 'perm-1',
          module: 'user',
          action: 'read',
          description: 'Read users',
          isSystem: true,
          createdAt: role.permissions[0].createdAt,
          updatedAt: role.permissions[0].updatedAt,
        },
      ],
    });
  });

  it('omits permissions when the relation was not loaded', () => {
    expect(
      RoleMapper.toResponse({ ...role, permissions: undefined } as never),
    ).not.toHaveProperty('permissions');
  });

  it('maps a list of roles', () => {
    expect(RoleMapper.toResponseList([role, role] as never)).toHaveLength(2);
  });
});
