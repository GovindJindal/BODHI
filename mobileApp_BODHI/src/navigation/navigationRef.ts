import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

/** Clears the whole stack and shows the Auth screen (used on logout / expired session). */
export function resetToAuth() {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
  }
}
