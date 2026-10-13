import { describe, expect, it } from 'vitest';
import { getProductViewMode } from './productViewMode';

const none = { isOwner: false, isOrganizer: false, isAdmin: false };

describe('getProductViewMode', () => {
  it('gives visitors buyer actions only and nothing to switch to', () => {
    expect(getProductViewMode({ role: 'participant', ...none })).toEqual({
      panel: null,
      buyerActions: true,
      roles: ['participant'],
    });
  });

  it('shows the seller tools only in the participant role', () => {
    expect(getProductViewMode({ role: 'participant', ...none, isOwner: true })).toEqual({
      panel: 'seller',
      buyerActions: false,
      roles: ['participant'],
    });
    expect(getProductViewMode({ role: 'organizer', ...none, isOwner: true })).toMatchObject({
      panel: null,
      buyerActions: false,
    });
  });

  it('organizers can switch between their tools and the buyer view in both roles', () => {
    const organizer = { ...none, isOrganizer: true };
    expect(getProductViewMode({ role: 'organizer', ...organizer })).toMatchObject({
      panel: 'organizer',
      roles: ['participant', 'organizer'],
    });
    expect(getProductViewMode({ role: 'participant', ...organizer })).toMatchObject({
      panel: null,
      buyerActions: true,
      roles: ['participant', 'organizer'],
    });
  });

  it('shows moderation only in the administrator role', () => {
    expect(getProductViewMode({ role: 'administrator', ...none, isAdmin: true })).toMatchObject({
      panel: 'admin',
      buyerActions: false,
      roles: ['participant', 'administrator'],
    });
    expect(getProductViewMode({ role: 'organizer', ...none, isAdmin: true })).toMatchObject({
      panel: null,
      buyerActions: true,
    });
  });

  it('never mixes tools for a seller who also organizes the event', () => {
    const both = { ...none, isOwner: true, isOrganizer: true };
    expect(getProductViewMode({ role: 'participant', ...both }).panel).toBe('seller');
    expect(getProductViewMode({ role: 'organizer', ...both }).panel).toBe('organizer');
  });
});
