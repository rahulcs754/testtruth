export function cartTotal(items, coupon) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return applyCoupon(subtotal, coupon);
}

export function applyCoupon(subtotal, coupon) {
  if (!coupon) return subtotal;
  if (subtotal >= coupon.minSpend) {
    return Math.max(0, subtotal - coupon.amount);
  }
  return subtotal;
}

export function freeShipping(subtotal) {
  return subtotal > 999;
}
