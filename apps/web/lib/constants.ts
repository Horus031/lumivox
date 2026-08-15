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

export const stats = [
  { v: "47k+", key: "sessions" },
  { v: "92%", key: "focus" },
  { v: "4.9*", key: "rating" },
  { v: "12 min", key: "saved" },
];

export const testimonials = [
  {
    key: "linh",
    name: "Linh Nguyen",
  },
  {
    key: "marcus",
    name: "Marcus Reid",
  },
  {
    key: "trang",
    name: "Trang Pham",
  },
];

export const plans = [
  {
    key: "starter",
  },
  {
    key: "pro",
    highlighted: true,
  },
  {
    key: "campus",
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
