import { useCallback, useEffect } from "react";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next, useTranslation as useI18nextTranslation } from "react-i18next";

import de from "./locales/de.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export type Language = "de" | "en" | "fr";
type LanguageLabelKey = "lang.de" | "lang.en" | "lang.fr";

const STORAGE_KEY = "ss-lang";

const resources = {
  de: { translation: de },
  en: { translation: en },
  fr: { translation: fr },
} as const;

const normalizeLanguage = (lng?: string): Language => {
  if (lng?.startsWith("en")) return "en";
  if (lng?.startsWith("fr")) return "fr";
  return "de";
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "de",
    supportedLngs: ["de", "en", "fr"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: STORAGE_KEY,
    },
    react: { useSuspense: false },
    interpolation: {
      escapeValue: false,
      prefix: "{",
      suffix: "}",
    },
    returnEmptyString: false,
  });

const setDocumentLanguage = (lang: Language) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
};

i18n.on("languageChanged", (lng) => {
  setDocumentLanguage(normalizeLanguage(lng));
});

export const languageOptions: { code: Language; flag: string; labelKey: LanguageLabelKey }[] = [
  { code: "de", flag: "DE", labelKey: "lang.de" },
  { code: "en", flag: "EN", labelKey: "lang.en" },
  { code: "fr", flag: "FR", labelKey: "lang.fr" },
];

export const useTranslation = () => {
  const { t, i18n: instance } = useI18nextTranslation();
  const language = normalizeLanguage(instance.resolvedLanguage ?? instance.language);

  useEffect(() => {
    setDocumentLanguage(language);
  }, [language]);

  const setLanguage = useCallback(
    (lang: Language) => {
      void instance.changeLanguage(lang);
    },
    [instance]
  );

  return { t, language, setLanguage, i18n: instance };
};

export default i18n;
