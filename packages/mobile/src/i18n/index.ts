import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'react-native-localize';
import { I18nManager } from 'react-native';

import en from './en.json';
import zhTW from './zh-TW.json';
import ar from './ar.json';

const SUPPORTED = ['en', 'zh-TW', 'ar'] as const;

function detectLanguage(): string {
  try {
    const tag = getLocales()[0]?.languageTag ?? 'en';
    if (tag.startsWith('zh')) return 'zh-TW';
    if (tag.startsWith('ar')) return 'ar';
    return 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-TW': { translation: zhTW },
    ar: { translation: ar },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Handle RTL for Arabic
i18n.on('languageChanged', (lng: string) => {
  const isRTL = lng === 'ar';
  if (I18nManager.isRTL !== isRTL) {
    I18nManager.forceRTL(isRTL);
    // Note: RTL change requires app restart to take full effect
  }
});

export { SUPPORTED };
export default i18n;
