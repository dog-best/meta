import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

import AppHeader from "@/components/common/AppHeader";
import { getPreferredMarketChain, fetchMarketChains, setPreferredMarketChain } from "@/services/market/chainConfig";
import { getMyWalletForChain, ensureSmartAccount } from "@/services/market/usdcCheckout";
import { requireLocalAuth } from "@/utils/secureAuth";
import { supabase } from "@/services/supabase";

type SellerProfile = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string | null;
  is_verified: boolean;
  logo_path: string | null;
  banner_path: string | null;
  payout_tier: "standard" | "fast";
  active?: boolean;
};

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.62)";
const BLUE = "#3B82F6";

function publicUrl(bucket: string, path?: string | null) {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function Badge({ text, tone }: { text: string; tone: "purple" | "green" | "gray" }) {
  const map = {
    purple: { bg: "rgba(124,58,237,0.18)", bd: "rgba(124,58,237,0.40)", fg: "rgba(221,214,254,0.95)" },
    green: { bg: "rgba(34,197,94,0.14)", bd: "rgba(34,197,94,0.40)", fg: "rgba(187,247,208,0.95)" },
    gray: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)", fg: "rgba(255,255,255,0.85)" },
  }[tone];

  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: map.bg, borderWidth: 1, borderColor: map.bd }}>
      <Text style={{ color: map.fg, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function CardBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 12, borderRadius: 22, padding: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
      {children}
    </View>
  );
}

function ActionBtn({
  label,
  icon,
  onPress,
  variant = "outline",
}: {
  label: string;
  icon: any;
  onPress: () => void;
  variant?: "solid" | "outline";
}) {
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        backgroundColor: solid ? PURPLE : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: solid ? "rgba(124,58,237,0.70)" : "rgba(255,255,255,0.12)",
      }}
    >
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={{ color: "#fff", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

export default function MarketAccountTab() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [chains, setChains] = useState<any[]>([]);
  const [chain, setChain] = useState<any | null>(null);
  const [wallet, setWallet] = useState<{ address: string } | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletErr, setWalletErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = auth?.user;
      if (!user) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("market_seller_profiles")
        .select("user_id,market_username,display_name,business_name,is_verified,logo_path,banner_path,payout_tier,active")
        .eq("user_id", user.id)
        .maybeSingle();

      setProfile(error ? null : (data as any));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadChains() {
    try {
      const items = await fetchMarketChains();
      setChains(items);
      const preferred = await getPreferredMarketChain();
      setChain(preferred);
      if (preferred) {
        const w = await getMyWalletForChain(preferred.chain);
        setWallet(w ? { address: w.address } : null);
      }
    } catch {
      setChains([]);
      setChain(null);
      setWallet(null);
    }
  }

  useEffect(() => {
    load();
    loadChains();
  }, []);

  const handle = useMemo(() => (profile?.market_username ? `@${profile.market_username}` : "@yourstore"), [profile?.market_username]);

  const storeName = useMemo(() => {
    const n = profile?.business_name || profile?.display_name || "Your store";
    return n;
  }, [profile?.business_name, profile?.display_name]);

  const logo = publicUrl("market-sellers", profile?.logo_path);
  const banner = publicUrl("market-sellers", profile?.banner_path);

  if (loading) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <AppHeader title="Market Account" subtitle="Manage your store profile, listings, and marketplace wallet." />
        <View style={{ marginTop: 70, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Loading...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
      <AppHeader title="Market Account" subtitle="Manage your store profile, listings, and marketplace wallet." />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>Market Account</Text>
          <Pressable
            onPress={load}
            style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </Pressable>
        </View>
        <Text style={{ marginTop: 6, color: MUTED }}>
          Manage your store profile, listings, and marketplace wallet.
        </Text>

        {!profile ? (
          <CardBox>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(124,58,237,0.18)", borderWidth: 1, borderColor: "rgba(124,58,237,0.35)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="storefront-outline" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>No Market Profile</Text>
                <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                  Create one to sell and get a public store page.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.push("/market/profile/create" as any)}
              style={{ marginTop: 12, borderRadius: 18, paddingVertical: 14, alignItems: "center", backgroundColor: PURPLE, borderWidth: 1, borderColor: "rgba(124,58,237,0.8)" }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Create Market Profile</Text>
            </Pressable>
          </CardBox>
        ) : (
          <View style={{ marginTop: 12, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: BORDER, backgroundColor: CARD }}>
            <View style={{ height: 150 }}>
              {banner ? (
                <Image source={{ uri: banner }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <LinearGradient colors={["rgba(124,58,237,0.35)", "rgba(255,255,255,0.04)"]} style={{ width: "100%", height: "100%" }} />
              )}

              <LinearGradient
                colors={["rgba(0,0,0,0.0)", "rgba(5,4,11,0.85)"]}
                style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }}
              />
            </View>

            <View style={{ padding: 14, marginTop: -34, flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
              <View style={{ width: 78, height: 78, borderRadius: 26, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }}>
                {logo ? <Image source={{ uri: logo }} style={{ width: 78, height: 78 }} /> : <Ionicons name="person-outline" size={26} color="rgba(255,255,255,0.8)" />}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>{handle}</Text>
                  {profile.is_verified ? (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(59,130,246,0.15)", borderWidth: 1, borderColor: "rgba(59,130,246,0.35)" }}>
                      <Ionicons name="checkmark-circle" size={14} color={BLUE} />
                    </View>
                  ) : null}
                  <Badge text={profile.payout_tier === "fast" ? "Fast payouts" : "Standard payouts"} tone="purple" />
                </View>

                <Text style={{ marginTop: 6, color: MUTED, fontWeight: "800" }}>{storeName}</Text>
              </View>
            </View>

            <View style={{ padding: 14, paddingTop: 2 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <ActionBtn label="Edit" icon="create-outline" onPress={() => router.push("/market/profile/edit" as any)} variant="outline" />
                <ActionBtn
                  label="View"
                  icon="eye-outline"
                  onPress={() => router.push(`/market/profile/${profile.market_username}` as any)}
                  variant="solid"
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <ActionBtn
                  label="My listings"
                  icon="albums-outline"
                  onPress={() => router.push("/market/listings?mine=1" as any)}
                  variant="outline"
                />

                <ActionBtn label="Wallet" icon="wallet-outline" onPress={() => router.push("/market/wallet" as any)} variant="outline" />
              </View>
            </View>
          </View>
        )}

        <CardBox>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Fintech</Text>
          <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
            Go back to your main finance tabs.
          </Text>

          <Pressable
            onPress={() => router.push("/fintech/(tabs)" as any)}
            style={{
              marginTop: 12,
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Open Fintech Tabs</Text>
          </Pressable>
        </CardBox>

        <CardBox>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>USDC Wallet (non-custodial)</Text>
          <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
            Create your smart account only when you’re ready. We never store your private keys.
          </Text>

          <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {chains.map((c) => {
              const active = c.active;
              const selected = chain?.chain === c.chain;
              return (
                <Pressable
                  key={c.chain}
                  disabled={!active}
                  onPress={async () => {
                    setChain(c);
                    await setPreferredMarketChain(c.chain);
                    const w = await getMyWalletForChain(c.chain);
                    setWallet(w ? { address: w.address } : null);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? "rgba(59,130,246,0.20)" : "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: selected ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.12)",
                    opacity: active ? 1 : 0.45,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
                    {String(c.chain).toUpperCase().replace("_", " ")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 }}>
              {chain?.active ? "Active network" : "Network not active yet"}
            </Text>
            <Text style={{ marginTop: 6, color: "#fff", fontWeight: "900" }}>
              {wallet?.address ? wallet.address : "No wallet address generated"}
            </Text>
          </View>

          {walletErr ? (
            <Text style={{ marginTop: 10, color: "#FCA5A5", fontWeight: "800" }}>{walletErr}</Text>
          ) : null}

          <Pressable
            disabled={!chain?.active || walletBusy}
            onPress={async () => {
              if (!chain) return;
              setWalletErr(null);
              setWalletBusy(true);
              try {
                const auth = await requireLocalAuth("Create smart wallet");
                if (!auth.ok) throw new Error(auth.message || "Authentication required");
                const res = await ensureSmartAccount(chain);
                setWallet({ address: res.address });
              } catch (e: any) {
                setWalletErr(e?.message || "Could not generate wallet");
              } finally {
                setWalletBusy(false);
              }
            }}
            style={{
              marginTop: 12,
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: chain?.active ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: chain?.active ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.12)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>
              {walletBusy ? "Generating..." : wallet?.address ? "Regenerate wallet" : "Generate wallet"}
            </Text>
          </Pressable>
        </CardBox>

        <CardBox>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Seller verification</Text>
          <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
            Apply for a badge and higher trust ranking.
          </Text>

          <Pressable
            onPress={() => router.push("/market/verification/apply" as any)}
            style={{
              marginTop: 12,
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Apply / Check status</Text>
          </Pressable>
        </CardBox>
      </ScrollView>
    </LinearGradient>
  );
}
