import ProfileEditor from '@/components/ProfileEditor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  return <ProfileEditor showBackButton topPadding={insets.top + 24} />;
}
