import { Tabs, router } from "expo-router";
import React, { useEffect } from "react";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuth } from "@/utils/AuthContext";
import { ActivityIndicator, View, Text, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: Colors.dark.background,
        }}
      >
        <ActivityIndicator size="large" color={Colors.dark.tint} />
      </View>
    );
  }

  if (!user) return null;

  const theme = Colors[colorScheme ?? "dark"];

  const baseHeight = 54;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.backgroundSecondary,
          borderTopColor: theme.border,
          borderTopWidth: 1,

          height: baseHeight + insets.bottom,
          paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 6 : 0),
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Trips",
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>📍</Text>,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>⟳</Text>,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>👥</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: () => <Text style={{ fontSize: 18 }}>◉</Text>,
        }}
      />
    </Tabs>
  );
}
