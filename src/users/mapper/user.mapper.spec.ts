import { UserMapper } from './user.mapper';

describe('UserMapper', () => {
  const user = {
    id: 'user-1',
    userCode: 'USR-20260101-ABCDEF',
    email: 'a@example.com',
    fullName: 'Nguyễn Văn A',
    password: 'hashed',
    roles: [
      {
        id: 'role-1',
        name: 'admin',
        description: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  it('maps a user without leaking sensitive fields', () => {
    const result = UserMapper.toResponse(user as never);

    expect(result).toEqual({
      id: 'user-1',
      userCode: 'USR-20260101-ABCDEF',
      email: 'a@example.com',
      fullName: 'Nguyễn Văn A',
      roles: [
        {
          id: 'role-1',
          name: 'admin',
          description: null,
          createdAt: user.roles[0].createdAt,
          updatedAt: user.roles[0].updatedAt,
        },
      ],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    expect(result).not.toHaveProperty('password');
  });

  it('defaults a missing userCode to an empty string', () => {
    expect(
      UserMapper.toResponse({ ...user, userCode: null } as never).userCode,
    ).toBe('');
  });

  it('maps a list of users', () => {
    expect(UserMapper.toResponseList([user, user] as never)).toHaveLength(2);
  });
});
