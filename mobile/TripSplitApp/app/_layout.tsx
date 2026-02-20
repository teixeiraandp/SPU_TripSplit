import { Stack } from 'expo-router';
import { AuthProvider } from '@/utils/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';


export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="trip/[id]" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
