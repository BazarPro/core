import { describe, expect, it } from 'vitest';
import { getProductViewMode } from './productViewMode';

const none = { isOwner: false, isOrganizer: false, isAdmin: false };

describe('getProductViewMode', () => {
  it('gives visitors buyer actions only', () => {
    expect(getProductViewMode({ role: 'participant', ...none })).toEqual({
      panel: null,
      buyerActions: true,
      otherRoles: [],
    });
  });

  it('shows the seller tools only in the participant role', () => {
    expect(getProductViewMode({ role: 'participant', ...none, isOwner: true })).toEqual({
      panel: 'seller',
      buyerActions: false,
      otherRoles: [],
    });
    expect(getProductViewMode({ role: 'organizer', ...none, isOwner: true })).toEqual({
      panel: null,
      buyerActions: false,
      otherRoles: ['participant'],
    });
  });

  it('shows the organizer tools only in the organizer role', () => {
    expect(getProductViewMode({ role: 'organizer', ...none, isOrganizer: true }).panel).toBe(
      'organizer'
    );
    expect(getProductViewMode({ role: 'participant', ...none, isOrganizer: true })).toEqual({
      panel: null,
      buyerActions: true,
      otherRoles: ['organizer'],
    });
  });

  it('shows moderation only in the administrator role', () => {
    expect(getProductViewMode({ role: 'administrator', ...none, isAdmin: true })).toEqual({
      panel: 'admin',
      buyerActions: false,
      otherRoles: [],
    });
    expect(getProductViewMode({ role: 'organizer', ...none, isAdmin: true })).toEqual({
      panel: null,
      buyerActions: true,
      otherRoles: ['administrator'],
    });
  });

  it('never mixes tools for a seller who also organizes the event', () => {
    const both = { ...none, isOwner: true, isOrganizer: true };
    expect(getProductViewMode({ role: 'participant', ...both })).toMatchObject({
      panel: 'seller',
      otherRoles: ['organizer'],
    });
    expect(getProductViewMode({ role: 'organizer', ...both })).toMatchObject({
      panel: 'organizer',
      otherRoles: ['participant'],
    });
  });
});
