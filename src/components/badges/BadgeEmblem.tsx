import React from "react";
import {
  Bike,
  Bird,
  BookMarked,
  Brain,
  CalendarClock,
  Coffee,
  Compass,
  Egg,
  Feather,
  Flame,
  HelpCircle,
  Languages,
  Lightbulb,
  MailCheck,
  MessagesSquare,
  Quote,
  Scissors,
  Share2,
  ShieldCheck,
  Sunrise,
  Target,
  Timer,
  TrainFront,
  TrendingUp,
  Trophy,
  Undo2,
  UserPlus,
  Users,
  Wind,
  Wine,
  type LucideIcon,
} from "lucide-react";

/** The pictogram at the heart of each badge. */
export const PICTOGRAMS: Record<string, LucideIcon> = {
  first_draft: Feather,
  big_talker: MessagesSquare,
  tour_de_france: Bike,
  eternal_flame: Flame,
  comeback: Undo2,
  inbox_zero: MailCheck,
  shakespeare: Quote,
  laconic: Scissors,
  diesel: TrendingUp,
  tgv: TrainFront,
  philosopher: Brain,
  no_net: ShieldCheck,
  franglais: Languages,
  neologist: Lightbulb,
  early_bird: Sunrise,
  afterwork: Wine,
  sunday_night: CalendarClock,
  coffee_break: Coffee,
  nomad: Compass,
  phoenix: Bird,
  metronome: Timer,
  perfect_pitch: Target,
  chef_breath: Wind,
  remontada: Trophy,
  ambassador: UserPlus,
  influencer: Share2,
  silver_glossary: BookMarked,
  team_spirit: Users,
  easter_egg: Egg,
};

interface BadgeEmblemProps {
  id: string;
  earned: boolean;
  /** A secret badge shows a question mark until it is found. */
  hidden?: boolean;
  size?: number;
}

/**
 * A badge's medal: Tysta's ring and waves around a pictogram. A signal
 * yellow disc once earned, a dashed outline until then.
 */
export const BadgeEmblem: React.FC<BadgeEmblemProps> = ({
  id,
  earned,
  hidden = false,
  size = 64,
}) => {
  const Pictogram = hidden ? HelpCircle : (PICTOGRAMS[id] ?? HelpCircle);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${earned ? "text-on-signal" : "text-ink-3"}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        className="absolute inset-0 size-full"
      >
        <circle
          cx="32"
          cy="32"
          r="30"
          strokeWidth="1.5"
          strokeDasharray={earned ? undefined : "3 5"}
          className={earned ? "fill-signal stroke-signal" : "fill-transparent"}
          opacity={earned ? 1 : 0.6}
        />
        {earned && (
          <>
            <circle cx="32" cy="32" r="25.5" strokeWidth="0.75" opacity="0.4" />
            <path
              d="M9 44c7-5 11 3 19 0s12-5 18-1 7 2 9 0"
              strokeWidth="0.9"
              opacity="0.35"
            />
            <path
              d="M12 50c6-4 10 2 17 0s11-4 16-1 5 1 7 0"
              strokeWidth="0.9"
              opacity="0.25"
            />
          </>
        )}
      </svg>
      <Pictogram
        size={size * 0.38}
        strokeWidth={1.6}
        className={`relative ${earned ? "" : "opacity-70"}`}
      />
    </span>
  );
};
