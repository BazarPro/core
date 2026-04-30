import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export function useFeatureFlags() {
  const flags = useQuery(api.featureFlags.get, {});

  return {
    isDemoMode: flags?.['is_demo_mode'] ?? false,
    isLoginEnabled: flags?.['is_login_enabled'] ?? true,
    isRegistrationEnabled: flags?.['is_registration_enabled'] ?? true,
    isEventCreationEnabled: flags?.['is_event_creation_enabled'] ?? true,
    isUndoInventoryActionsEnabled: flags?.['allow_undo_inventory_actions'] ?? false,
    isLoading: flags === undefined,
  };
}
