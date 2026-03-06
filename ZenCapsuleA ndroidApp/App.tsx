/**
 * Zen Capsule - Focus Management App
 * Digital barrier powered by AI urgency detection
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F1A" />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
