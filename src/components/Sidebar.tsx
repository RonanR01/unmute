import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Award,
  BarChart3,
  BookOpen,
  Cog,
  Cpu,
  FlaskConical,
  History,
  Home,
  Info,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { UnwriteLogo, UnwriteMark } from "./icons/UnwriteLogo";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
} from "./settings";

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

/** The screens of the app, in menu order. */
export const SCREENS = {
  today: { labelKey: "sidebar.today", icon: Home },
  dictations: { labelKey: "sidebar.dictations", icon: Mic },
  insights: { labelKey: "sidebar.insights", icon: BarChart3 },
  badges: { labelKey: "sidebar.badges", icon: Award },
  dictionary: { labelKey: "sidebar.dictionary", icon: BookOpen },
  settings: { labelKey: "sidebar.settings", icon: SlidersHorizontal },
} as const satisfies Record<
  string,
  { labelKey: string; icon: React.ComponentType<IconProps> }
>;

export type Screen = keyof typeof SCREENS;

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  /** `null` when App renders the section itself (Debug, with its handlers). */
  component: React.ComponentType | null;
  enabled: (settings: any) => boolean;
}

/** The tabs of the Settings screen. */
export const SECTIONS_CONFIG = {
  general: {
    labelKey: "sidebar.general",
    icon: Cog,
    component: GeneralSettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: SlidersHorizontal,
    component: AdvancedSettings,
    enabled: () => true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    component: PostProcessingSettings,
    // Always there: the voice portrait is written by the model chosen here,
    // whether or not dictations are post-processed.
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: null,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

const COLLAPSED_KEY = "unwrite.sidebar.collapsed";

/** Whether the menu was left reduced to its icons. */
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

interface SidebarProps {
  activeScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  onScreenChange,
}) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Not remembered, that's all.
    }
  };

  const toggleLabel = collapsed ? t("sidebar.expand") : t("sidebar.collapse");
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <nav
      aria-label={t("sidebar.navigation")}
      data-tauri-drag-region
      className={`flex flex-col shrink-0 h-full px-3 pb-4 pt-[calc(var(--titlebar-inset)+20px)] gap-7 transition-[width] duration-200 ${
        collapsed ? "w-20" : "w-52"
      }`}
    >
      {collapsed ? (
        <UnwriteMark className="mx-auto text-text" />
      ) : (
        <UnwriteLogo className="px-3" />
      )}
      <div className="flex flex-1 flex-col gap-1">
        {(Object.keys(SCREENS) as Screen[]).map((id) => {
          const { labelKey, icon: Icon } = SCREENS[id];
          const isActive = activeScreen === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onScreenChange(id)}
              aria-label={collapsed ? t(labelKey) : undefined}
              title={collapsed ? t(labelKey) : undefined}
              className={`flex items-center gap-3 min-h-11 px-3 rounded-[10px] text-start text-[15px] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-text ${
                isActive
                  ? "bg-nav-active text-text font-semibold"
                  : "text-ink-3 font-medium hover:text-text hover:bg-surface"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              {!collapsed && <span className="truncate">{t(labelKey)}</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        className="flex items-center min-h-11 px-3 rounded-[10px] text-ink-3 cursor-pointer transition-colors hover:text-text hover:bg-surface focus-visible:outline-2 focus-visible:outline-text"
      >
        <Toggle size={18} strokeWidth={1.75} className="shrink-0" />
      </button>
    </nav>
  );
};
