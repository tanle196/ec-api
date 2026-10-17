import { RoleMapper } from './role.mapper';

describe('RoleMapper', () => {
  const role = {
    id: 'role-1',
    name: 'admin',
    description: 'Administrator',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    permissions: [{ id: 'perm-1' }],
    users: [],
  };

  it('maps a role entity to the public response shape', () => {
    expect(RoleMapper.toResponse(role as never)).toEqual({
      id: 'role-1',
      name: 'admin',
      description: 'Administrator',
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    });
  });

  it('maps a list of roles', () => {
    expect(RoleMapper.toResponseList([role, role] as never)).toHaveLength(2);
  });
});
