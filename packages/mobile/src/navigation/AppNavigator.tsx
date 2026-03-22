import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import FocusScreen from '../screens/FocusScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import BreakReportScreen from '../screens/BreakReportScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HistoryStack = createNativeStackNavigator();

// History tab has its own stack: list → detail (break report)
function HistoryStackScreen() {
  return (
    <HistoryStack.Navigator>
      <HistoryStack.Screen
        name="HistoryList"
        component={HistoryScreen}
        options={{ headerShown: false }}
      />
      <HistoryStack.Screen
        name="SessionDetail"
        component={BreakReportScreen}
        options={{
          title: '攔截報告',
          headerStyle: { backgroundColor: '#FFF5EB' },
          headerTintColor: '#E8712A',
          headerTitleStyle: { color: '#2D1B0E' },
        }}
      />
    </HistoryStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#FFF5EB' },
        headerTintColor: '#2D1B0E',
        tabBarStyle: {
          backgroundColor: '#FFF5EB',
          borderTopColor: '#FFF0E0',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#E8712A',
        tabBarInactiveTintColor: '#C4B098',
      }}>
      <Tab.Screen
        name="Focus"
        component={FocusScreen}
        options={{
          title: 'Focus',
          headerTitle: '🧘 Zen Capsule',
          tabBarLabel: 'Focus',
          tabBarIcon: ({ color }) => (
            <TabIcon label="🎯" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryStackScreen}
        options={{
          title: 'History',
          headerTitle: 'Session History',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <TabIcon label="📊" color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
          tabBarIcon: ({ color }) => (
            <TabIcon label="⚙️" color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Simple emoji-based tab icon (replace with vector icons later)
function TabIcon({ label }: { label: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>{label}</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#FFF5EB',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator size="large" color="#E8712A" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ animationTypeForReplace: 'pop' }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
