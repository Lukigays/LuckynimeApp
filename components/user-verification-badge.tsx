import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import { isSpecialRole } from "@/lib/admin-service";

export type VerificationStatus = "developer_admin" | "verified_member" | "none";

export function getVerificationStatus(
  role?: string | null,
  isVip?: boolean | null
): VerificationStatus {
  if (!role || role === "guest") return "none";

  const cleanRole = (role || "").trim().toLowerCase();
  if (cleanRole === "guest" || cleanRole === "none") return "none";

  // 1. Centang Merah: Semua pengguna dengan Role Khusus (Admin, Developer, Owner, Support, Moderator, dll)
  if (isSpecialRole(cleanRole)) {
    return "developer_admin";
  }

  // 2. Centang Biru: Seluruh Member biasa / Member VIP
  return "verified_member";
}

export interface UserVerificationBadgeProps {
  role?: string | null;
  isVip?: boolean | null;
  size?: number;
}

export function UserVerificationBadge({
  role,
  isVip,
  size = 14,
}: UserVerificationBadgeProps) {
  const status = getVerificationStatus(role, isVip);

  if (status === "developer_admin") {
    return <AppIcon name="check-decagram" size={size} color="#EF4444" />;
  }

  if (status === "verified_member") {
    return <AppIcon name="check-decagram" size={size} color="#9CA3AF" />;
  }

  return null;
}

export function SystemRoleBadge({
  role,
  compact = false,
}: {
  role?: string | null;
  compact?: boolean;
}) {
  if (!role || !isSpecialRole(role)) return null;
  const label = role.replace(/_/g, " ").trim().toUpperCase();
  if (!label || label === "MEMBER" || label === "GUEST") return null;

  return (
    <View style={[roleStyles.pill, compact && roleStyles.pillCompact]}>
      <AppIcon name="shield-check" size={compact ? 9 : 10} color="#F87171" />
      <Text style={[roleStyles.text, compact && roleStyles.textCompact]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const roleStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.42)",
  },
  pillCompact: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    gap: 2.5,
  },
  text: {
    fontFamily: "Nunito-Bold",
    fontSize: 9.5,
    color: "#FCA5A5",
    letterSpacing: 0.4,
  },
  textCompact: {
    fontSize: 8.5,
    letterSpacing: 0.3,
  },
});
