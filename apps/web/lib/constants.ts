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
    title: "Behavioral analytics",
    desc: "We learn from your sessions, breaks and energy patterns to surface when you do your best work.",
  },
  {
    icon: Sparkles,
    title: "AI recommendations",
    desc: "A gentle coach that suggests what to study next, how long to focus, and when to truly rest.",
  },
  {
    icon: Timer,
    title: "Immersive focus mode",
    desc: "Calm timers, ambient rooms and distraction shields turn any moment into deep work.",
  },
  {
    icon: Target,
    title: "Goal-linked tasks",
    desc: "Every task maps to a long-term goal, so progress always feels meaningful, not mechanical.",
  },
  {
    icon: Users,
    title: "Live study rooms",
    desc: "Sit beside other learners in themed rooms — presence, not pressure.",
  },
  {
    icon: Coins,
    title: "Streaks & rewards",
    desc: "Earn tokens, protect streaks with shields, and unlock cozy themes as you grow.",
  },
];

export const steps = [
  {
    n: "01",
    title: "Capture your intentions",
    desc: "Drop tasks, link them to goals, or let AI break a big project into bite-sized steps.",
    icon: CheckSquare,
  },
  {
    n: "02",
    title: "Enter calm focus",
    desc: "Pick an ambient room, set a timer, and let Lumivox quietly track what helps you flow.",
    icon: Timer,
  },
  {
    n: "03",
    title: "Learn from your patterns",
    desc: "See your best hours, your friction points, and AI suggestions to keep your week balanced.",
    icon: BarChart3,
  },
];

export const stats = [
  { v: "47k+", l: "Sessions completed" },
  { v: "92%", l: "Report better focus" },
  { v: "4.9★", l: "Average user rating" },
  { v: "12 min", l: "Saved per study day" },
];

export const testimonials = [
  {
    quote:
      "Lumivox feels like a study partner who actually pays attention. The AI nudges are scary-accurate without being annoying.",
    name: "Linh Nguyen",
    role: "Computer Science, NUS",
  },
  {
    quote:
      "I stopped over-planning and started actually finishing. The heatmap alone changed how I think about my week.",
    name: "Marcus Reid",
    role: "Pre-med, Stanford",
  },
  {
    quote:
      "Calm Forest at 11pm with three friends silently focusing is the best productivity trick I've ever found.",
    name: "Trang Pham",
    role: "Design student, RMIT",
  },
];

export const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "forever",
    desc: "Everything you need to build a focused habit.",
    features: [
      "Unlimited tasks",
      "Focus timer & 4 rooms",
      "Weekly analytics",
      "Streaks & tokens",
    ],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$6",
    period: "/ month",
    desc: "Unlock the full AI coach and deep analytics.",
    features: [
      "Everything in Starter",
      "AI behavioral coach",
      "12-week heatmap & insights",
      "All ambient rooms",
      "Streak shields",
    ],
    cta: "Try Pro free",
    highlighted: true,
  },
  {
    name: "Campus",
    price: "Custom",
    period: "for teams",
    desc: "For universities, study groups and clubs.",
    features: [
      "Everything in Pro",
      "Group rooms & leaderboards",
      "Org analytics",
      "Priority support",
    ],
    cta: "Talk to us",
  },
];

export const faqs = [
  {
    q: "Is Lumivox free to use?",
    a: "Yes — the Starter plan is free forever and includes tasks, the focus timer, four ambient rooms and weekly analytics.",
  },
  {
    q: "How does the AI coach work?",
    a: "It quietly observes your focus sessions, completions and break patterns, then recommends what to study next, ideal session length, and when to rest.",
  },
  {
    q: "Is my data private?",
    a: "Your behavioral data is yours. We never sell it, and you can export or delete everything from settings at any time.",
  },
  {
    q: "Can I study with friends?",
    a: "Yes — join themed study rooms, see live presence, and use light reactions. Group rooms come with Campus plans.",
  },
];
