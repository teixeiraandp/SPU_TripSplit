import { Stack } from 'expo-router';
import { AuthProvider } from '@/utils/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trip/[id]" />
      </Stack>
    </AuthProvider>
  );
}