import type { LucideIcon } from "lucide-react";
import { Crown, Gamepad2, Medal, Target } from "lucide-react";

export type DashboardStat = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "primary" | "secondary" | "accent" | "success";
};

export const dashboardStats: DashboardStat[] = [
  {
    label: "Games played",
    value: "24",
    detail: "6 this month",
    icon: Gamepad2,
    tone: "secondary",
  },
  {
    label: "Wins",
    value: "12",
    detail: "Top 8% of players",
    icon: Crown,
    tone: "accent",
  },
  {
    label: "Win rate",
    value: "50%",
    detail: "+8% from last month",
    icon: Target,
    tone: "success",
  },
  {
    label: "Total score",
    value: "8,420",
    detail: "+1,350 this week",
    icon: Medal,
    tone: "primary",
  },
];

export const recentGames = [
  {
    title: "Trivia Night",
    result: "WIN",
    placement: "1st Place",
    points: "+420 pts",
    time: "2 hours ago",
  },
  {
    title: "Friday Chaos",
    result: "LOSS",
    placement: "4th Place",
    points: "+180 pts",
    time: "Yesterday",
  },
  {
    title: "Science Trap",
    result: "WIN",
    placement: "1st Place",
    points: "+510 pts",
    time: "2 days ago",
  },
  {
    title: "History Battle",
    result: "LOSS",
    placement: "3rd Place",
    points: "+240 pts",
    time: "4 days ago",
  },
];

export const onlineFriends = [
  {
    name: "Alex",
    username: "alexquiz",
  },
  { name: "Sarah", username: "sarahplays" },
  { name: "Yassine", username: "yassine" },
  { name: "Adam", username: "adamtrap" },
];
