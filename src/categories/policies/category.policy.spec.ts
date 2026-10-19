import { ConflictException } from '@nestjs/common';
import { CategoryPolicy } from './category.policy';

describe('CategoryPolicy', () => {
  const policy = new CategoryPolicy();

  it('rejects a category being its own parent', () => {
    expect(() => policy.assertNotOwnParent('c-1', 'c-2')).not.toThrow();
    expect(() => policy.assertNotOwnParent('c-1', null)).not.toThrow();
    expect(() => policy.assertNotOwnParent('c-1', 'c-1')).toThrow(
      ConflictException,
    );
  });

  it('rejects deleting a category with children', () => {
    expect(() => policy.assertCanDelete(0)).not.toThrow();
    expect(() => policy.assertCanDelete(2)).toThrow(ConflictException);
  });
});
