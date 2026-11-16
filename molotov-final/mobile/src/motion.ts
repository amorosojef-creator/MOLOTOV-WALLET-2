import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';

export const useMotion = () => ({ reduce: useReducedMotion() });
const safe = (f: () => Promise<void>) => { if (Platform.OS === 'web') return; f().catch(() => {}); };
export const hapticTap = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const hapticSelect = () => safe(() => Haptics.selectionAsync());
export const hapticSuccess = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const hapticError = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
