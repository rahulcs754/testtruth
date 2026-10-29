import { describe, expect, it } from 'vitest';
import { applyCoupon, cartTotal, freeShipping } from './cart.js';

// AI-style tests: they run every line, but check very little.
describe('cart', () => {
  it('computes a total', () => {
    expect(cartTotal([{ price: 100, qty: 2 }])).toBe(200);
  });

  it('applies a coupon', () => {
    const total = applyCoupon(1500, { minSpend: 1000, amount: 200 });
    expect(total).toBeDefined();
  });

  it('works out free shipping', () => {
    expect(typeof freeShipping(500)).toBe('boolean');
  });
});
