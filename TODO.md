# TODO

## Trả 409 thay vì 500 khi trùng dữ liệu do race

**Vấn đề**

Các kiểm tra trùng hiện làm theo kiểu "query trước rồi mới insert":

```ts
const exists = await this.productRepo.findOne({ where: { sku } });
if (exists) throw new ConflictException(`SKU '${sku}' already exists`);
await this.productRepo.save(product);
```

Hai request gần như đồng thời (bấm "Lưu" 2 lần, 2 admin tạo cùng SKU) đều có thể qua bước `findOne`. Request insert sau bị Postgres chặn bằng unique constraint, nên **dữ liệu không bị trùng**. Nhưng lỗi trả về là `QueryFailedError` (mã `23505`) chưa được xử lý, nên client nhận **500** thay vì **409** kèm message rõ ràng.

`ErrorMapper` ([src/common/errors/error-mapper.ts](src/common/errors/error-mapper.ts)) đã đổi được `23505` thành `ConflictException`, nhưng **chưa được dùng ở đâu** (chỉ có spec).

**Các chỗ bị ảnh hưởng** (đều đã có unique constraint trong DB)

| Service | Kiểm tra | Constraint |
|---|---|---|
| ProductsService | slug, sku | `UQ_products_slug`, `UQ_products_sku` |
| ProductsService | variant sku | `UQ_product_variants_sku` |
| ProductsService | tag name, tag slug | `UQ_tags_name`, `UQ_tags_slug` |
| CategoriesService | slug | `UQ_categories_slug` |
| DiscountsService | code | `UQ_discounts_code` |
| RolesService | name | `UQ_roles_name` |
| PermissionsService | module + action | `IDX_permissions_module_action` |
| ReviewsService | 1 review / user / product | `UQ_reviews_user_product` |
| WishlistsService | 1 product / user | `UQ_wishlists_user_product` |

**Hướng sửa**

- [ ] Bắt `QueryFailedError` mã `23505` để trả 409. Chọn một trong hai:
  - Exception filter toàn cục dùng `ErrorMapper`. Cách này nhanh, nhưng message chung chung (`Duplicate entry`).
  - Bắt trong từng service và map theo tên constraint (`error.constraint`) để giữ message cụ thể như hiện tại (`SKU 'X' already exists`).
- [ ] Giữ bước `findOne` kiểm tra trước để có message thân thiện trong đa số trường hợp. Unique constraint là lớp chặn cuối khi có race.
- [ ] Thêm test cho trường hợp `save` ném lỗi `23505` thì trả `ConflictException`.

**Lưu ý:** việc này đổi status code API trả về (500 thành 409), cần báo client/frontend.

## Chặn vòng lặp cha–con của category

`CategoryPolicy.assertNotOwnParent` chỉ chặn trường hợp category tự làm cha của chính nó. Nó vẫn cho chọn một category con/cháu làm cha, tạo vòng lặp A → B → A. Khi đó `findTree` (đệ quy `buildTreeNode`) không bao giờ thấy các category trong vòng lặp, vì không có category nào trong đó là root.

- [ ] Khi đổi `parent_id`, duyệt ngược chuỗi cha của parent mới. Nếu gặp chính `id` thì reject.
- [ ] Thêm test cho trường hợp cha là con/cháu.
