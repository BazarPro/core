import { describe, expect, it } from 'vitest';
import { isFullscreenDesk } from './fullscreenDesk';

describe('isFullscreenDesk', () => {
  it('is the full-screen cash desk only', () => {
    expect(isFullscreenDesk('/events/view/e1/checkout/fullscreen')).toBe(true);
    expect(isFullscreenDesk('/events/view/e1/checkout/fullscreen/')).toBe(true);
    expect(isFullscreenDesk('/events/view/e1/checkout')).toBe(false);
    expect(isFullscreenDesk('/events/view/e1/checkout/fullscreen/x')).toBe(false);
  });
});
