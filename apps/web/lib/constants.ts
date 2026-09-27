import {
  BarChart3,
  Brain,
  CheckSquare,
  Coins,
  Sparkles,
  Target,
  Timer,
  Users,
} from "lucide-react";

export const features = [
  {
    icon: Brain,
    key: "behavioralAnalytics",
  },
  {
    icon: Sparkles,
    key: "aiRecommendations",
  },
  {
    icon: Timer,
    key: "focusMode",
  },
  {
    icon: Target,
    key: "goalTasks",
  },
  {
    icon: Users,
    key: "studyRooms",
  },
  {
    icon: Coins,
    key: "rewards",
  },
];

export const steps = [
  {
    n: "01",
    key: "capture",
    icon: CheckSquare,
  },
  {
    n: "02",
    key: "focus",
    icon: Timer,
  },
  {
    n: "03",
    key: "patterns",
    icon: BarChart3,
  },
];

export const faqs = [
  {
    key: "free",
  },
  {
    key: "coach",
  },
  {
    key: "privacy",
  },
  {
    key: "friends",
  },
];
