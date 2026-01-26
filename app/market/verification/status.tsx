import { supabase } from "@/services/supabase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

type SellerProfile = {
  user_id: string;
  business_name: string | null;
  is_verified: boolean;
  payout_tier: "standard" | "fast";
};

type VerificationRequest = {
  id: string;
  user_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  admin_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  updated_at: string;
};

function StatusPill({ status }: { status: VerificationRequest["status"] }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    PENDING: { bg: "rgba(59,130,246,0.16)", fg: "#93C5FD", label: "Pending review" },
    APPROVED: { bg: "rgba(16,185,129,0.16)", fg: "#6EE7B7", label: "Approved" },
    REJECTED: { bg: "rgba(239,68,68,0.16)", fg: "#FCA5A5", label: "Rejected" },
  };
  const s = map[status] ?? { bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB", label: status };
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: `${s.fg}55`,
      }}
    >
      <Text style={{ color: s.fg, fontWeight: "900", fontSize: 12 }}>{s.label}</Text>
    </View>
  );
}

export default function VerificationStatus() {
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [reqRow, setReqRow] = useState<VerificationRequest | null>(null);

  const verified = Boolean(profile?.is_verified);

  const headline = useMemo(() => {
    if (!profile) return "No seller profile";
    if (verified) return "Verified ✅";
    if (!reqRow) return "Not applied yet";
    if (reqRow.status === "PENDING") return "Under review";
    if (reqRow.status === "REJECTED") return "Rejected";
    if (reqRow.status === "APPROVED") return "Approved (badge updating)";
    return "Verification";
  }, [profile, verified, reqRow]);

  async function load() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (!me) {
      router.replace("/(auth)/login" as any);
      return;
    }

    const { data: sp } = await supabase
      .from("market_seller_profiles")
      .select("user_id,business_name,is_verified,payout_tier")
      .eq("user_id", me)
      .maybeSingle();

    setProfile((sp as any) ?? null);

    const { data: vr } = await supabase
      .from("market_verification_requests")
      .select("id,user_id,status,note,admin_note,submitted_at,reviewed_at,updated_at")
      .eq("user_id", me)
      .maybeSingle();

    setReqRow((vr as any) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Verification</Text>
            <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              Seller trust + payout tier
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : (
          <View
            style={{
              borderRadius: 22,
              padding: 16,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              {profile?.business_name ? profile.business_name : "Your seller account"}
            </Text>

            <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons
                name={verified ? "checkmark-circle" : "alert-circle"}
                size={20}
                color={verified ? "rgba(16,185,129,1)" : "rgba(251,191,36,1)"}
              />
              <Text style={{ color: "#fff", fontWeight: "900" }}>{headline}</Text>
            </View>

            {/* Request status */}
            {reqRow ? (
              <View style={{ marginTop: 12 }}>
                <StatusPill status={reqRow.status} />

                {!!reqRow.admin_note ? (
                  <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.75)", lineHeight: 20 }}>
                    Admin note: {reqRow.admin_note}
                  </Text>
                ) : null}

                <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                  Submitted: {new Date(reqRow.submitted_at).toLocaleString()}
                </Text>
              </View>
            ) : (
              <Text style={{ marginTop: 12, color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
                You haven’t submitted verification yet. Apply and we’ll review it.
              </Text>
            )}

            {/* Payout tier info */}
            <Text style={{ marginTop: 12, color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
              Verified sellers can move to faster payout tier and higher limits (Team 3 rules).
            </Text>

            {/* Actions */}
            {!profile ? (
              <Pressable
                onPress={() => router.push("/market/profile/create" as any)}
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: PURPLE,
                  borderWidth: 1,
                  borderColor: PURPLE,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Create seller profile</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push("/market/verification/apply" as any)}
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: PURPLE,
                  borderWidth: 1,
                  borderColor: PURPLE,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  {reqRow ? "Update application" : "Apply for verification"}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={load}
              style={{
                marginTop: 10,
                borderRadius: 18,
                paddingVertical: 14,
                alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Refresh</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
