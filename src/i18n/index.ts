import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// zh-CN (fallback, always loaded)
import zhCommon from "./locales/zh-CN/common.json";
import zhEditor from "./locales/zh-CN/editor.json";
import zhSettings from "./locales/zh-CN/settings.json";
import zhPopup from "./locales/zh-CN/popup.json";

// en-US
import enCommon from "./locales/en-US/common.json";
import enEditor from "./locales/en-US/editor.json";
import enSettings from "./locales/en-US/settings.json";
import enPopup from "./locales/en-US/popup.json";

/**
 * 根据 locale 设置解析实际语言代码
 * 'auto' → 根据 navigator.language 自动检测
 */
export function resolveLocale(locale: string): string {
  if (locale !== "auto") return locale;
  const lang = navigator.language;
  if (lang.startsWith("zh")) return "zh-CN";
  return "en-US";
}

/**
 * 初始化 i18next
 * @param locale 用户选择的 locale（'auto' | 'zh-CN' | 'en-US'）
 */
export function initI18n(locale: string): Promise<void> {
  const resolvedLocale = resolveLocale(locale);

  return i18n.use(initReactI18next).init({
    lng: resolvedLocale,
    fallbackLng: "zh-CN",
    defaultNS: "common",
    ns: ["common", "editor", "settings", "popup"],
    resources: {
      "zh-CN": {
        common: zhCommon,
        editor: zhEditor,
        settings: zhSettings,
        popup: zhPopup,
      },
      "en-US": {
        common: enCommon,
        editor: enEditor,
        settings: enSettings,
        popup: enPopup,
      },
    },
    interpolation: {
      escapeValue: false, // React 已处理 XSS
    },
  }).then(() => undefined);
}

export { i18n };
