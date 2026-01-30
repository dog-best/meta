import { supabase } from "@/services/supabase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import AppHeader from "@/components/common/AppHeader";
const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

type SellerProfile = {
  user_id: string;
  business_name: string | null;
  market_username: string | null;
  is_verified: boolean;
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 22,
        padding: 16,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>{title}</Text>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

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

export default function VerificationApply() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [reqRow, setReqRow] = useState<VerificationRequest | null>(null);

  const [note, setNote] = useState("");

  const canSubmit = useMemo(() => {
    if (!profile) return false;
    if (profile.is_verified) return false; // already verified
    // allow submit anytime; if rejected/pending, we will upsert
    return true;
  }, [profile]);

  async function load() {
    console.log("[VerificationApply] load start");
    setLoading(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        router.replace("/(auth)/login" as any);
        return;
      }
      setMe(uid);

      // seller profile must exist
      const { data: sp, error: spErr } = await supabase
        .from("market_seller_profiles")
        .select("user_id,business_name,market_username,is_verified")
        .eq("user_id", uid)
        .maybeSingle();

      if (spErr) {
        setProfile(null);
      } else {
        setProfile((sp as any) ?? null);
      }

      // load existing request (if any)
      const { data: vr } = await supabase
        .from("market_verification_requests")
        .select("id,user_id,status,note,admin_note,submitted_at,reviewed_at,updated_at")
        .eq("user_id", uid)
        .maybeSingle();

      setReqRow((vr as any) ?? null);

      // prefill note if they already have one
      if ((vr as any)?.note) setNote(String((vr as any).note));
      else setNote("");
    } catch {
      setProfile(null);
      setReqRow(null);
      setNote("");
    } finally {
      setLoading(false);
      console.log("[VerificationApply] load end");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!me) return;
    if (!profile) {
      Alert.alert("Create seller profile", "You need a market seller profile before applying.", [
        { text: "Cancel", style: "cancel" },
        { text: "Create profile", onPress: () => router.push("/market/profile/create" as any) },
      ]);
      return;
    }

    if (profile.is_verified) {
      Alert.alert("Already verified", "Your seller account is already verified.");
      return;
    }

    const cleanNote = note.trim();
    if (cleanNote.length < 10) {
      Alert.alert("Add a short message", "Please tell us a bit about your store (at least 10 characters).");
      return;
    }

    setBusy(true);
    console.log("[VerificationApply] submit start");
    try {
      // IMPORTANT:
      // - If row exists: update status to PENDING again (re-apply)
      // - If new: create row as PENDING
      const payload: any = {
        user_id: me,
        status: "PENDING",
        note: cleanNote,
        // Keep admin_note as-is server-side; but on reapply we can clear it so UI isn't confusing
        admin_note: null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("market_verification_requests")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw new Error(error.message);

      Alert.alert("Submitted", "Your verification request has been submitted for review.");
      await load();
      router.replace("/market/verification/status" as any);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not submit verification.");
    } finally {
      setBusy(false);
      console.log("[VerificationApply] submit end");
    }
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
      <AppHeader title="Apply for Verification" subtitle="Admin approves before badge is granted" />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
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
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Apply for Verification</Text>
            <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              Admin approves before badge is granted
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : !profile ? (
          <Card title="You need a seller profile">
            <Text style={{ color: "rgba(255,255,255,0.7)", lineHeight: 20 }}>
              Create your market seller profile first, then apply for verification.
            </Text>

            <Pressable
              onPress={() => router.push("/market/profile/create" as any)}
              style={{
                marginTop: 12,
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
          </Card>
        ) : (
          <>
            <Card title="Seller account">
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
                {profile.business_name || `@${profile.market_username || "yourstore"}`}
              </Text>
              <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
                Current badge: {profile.is_verified ? "Verified ✅" : "Not verified"}
              </Text>

              {reqRow ? (
                <View style={{ marginTop: 12 }}>
                  <StatusPill status={reqRow.status} />
                  {!!reqRow.admin_note ? (
                    <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.75)", lineHeight: 20 }}>
                      Admin note: {reqRow.admin_note}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ marginTop: 12, color: "rgba(255,255,255,0.65)" }}>
                  No request yet. Submit one below.
                </Text>
              )}
            </Card>

            <Card title="Application message">
              <Text style={{ color: "rgba(255,255,255,0.7)", lineHeight: 20 }}>
                Tell us what you sell and why you should be verified. (This is what you’ll review in dashboard.)
              </Text>

              <View
                style={{
                  marginTop: 10,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Example: I sell electronics, I’ve completed 20 deliveries, I want faster payout tier…"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={{ color: "#fff", fontWeight: "700", minHeight: 90 }}
                  multiline
                />
              </View>

              <Pressable
                disabled={!canSubmit || busy}
                onPress={submit}
                style={{
                  marginTop: 12,
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: !canSubmit || busy ? "rgba(124,58,237,0.35)" : PURPLE,
                  borderWidth: 1,
                  borderColor: !canSubmit || busy ? "rgba(124,58,237,0.35)" : PURPLE,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  {busy ? "Submitting…" : reqRow ? "Update application" : "Submit application"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.replace("/market/verification/status" as any)}
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
                <Text style={{ color: "#fff", fontWeight: "900" }}>Back to status</Text>
              </Pressable>
            </Card>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
