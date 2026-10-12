"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { UserData } from "@/types/userData";
import { ProfileAchievements } from "./profile-achievements";
import { ProfileHeader } from "./profile-header";
import { ProfileStats } from "./profile-stats";
import { EditProfileDialog } from "./edit-profile-dialog";

export function ProfileView({ user, isOwner = false }: { user: UserData; isOwner?: boolean }) {
  const reducedMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.45 }}
      className="space-y-4 sm:space-y-5"
    >
      <ProfileHeader user={user} isOwner={isOwner} onEdit={() => setEditing(true)} />
      <ProfileStats user={user} />
      <ProfileAchievements achievements={user.achievements} />
      {isOwner ? <EditProfileDialog open={editing} onOpenChange={setEditing} user={user} /> : null}
    </motion.div>
  );
}
