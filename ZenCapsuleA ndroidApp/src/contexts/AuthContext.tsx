import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../services/api';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on app launch
    AsyncStorage.getItem('zen_capsule_token').then(token => {
      if (token) {
        AsyncStorage.getItem('zen_capsule_user').then(u => {
          if (u) setUser(JSON.parse(u));
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await api.saveToken(res.accessToken);
    await AsyncStorage.setItem('zen_capsule_refresh', res.refreshToken);
    await AsyncStorage.setItem('zen_capsule_user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const signUp = async (email: string, password: string) => {
    const res = await api.register(email, password);
    await api.saveToken(res.accessToken);
    await AsyncStorage.setItem('zen_capsule_refresh', res.refreshToken);
    await AsyncStorage.setItem('zen_capsule_user', JSON.stringify(res.user));
    setUser(res.user);
  };

  const signOut = async () => {
    await api.clearToken();
    await AsyncStorage.removeItem('zen_capsule_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
