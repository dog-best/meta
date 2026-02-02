import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { createPublicClient, encodeFunctionData, formatUnits, http } from "viem";

import AppHeader from "@/components/common/AppHeader";
import { getPreferredMarketChain, fetchMarketChains, setPreferredMarketChain } from "@/services/market/chainConfig";
import { getMyWalletForChain, ensureSmartAccount } from "@/services/market/usdcCheckout";
import { requireLocalAuth } from "@/utils/secureAuth";
import { supabase } from "@/services/supabase";
import { getRpcUrlForChain, getWalletBackupSecret, hasWalletBackup, markWalletBackedUp, regenerateWalletKey } from "@/utils/aaWallet";

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
const USDT_BY_CHAIN: Record<string, string | undefined> = {
  base_sepolia: process.env.EXPO_PUBLIC_USDT_ADDRESS_BASE_SEPOLIA,
  base: process.env.EXPO_PUBLIC_USDT_ADDRESS_BASE,
  arbitrum: process.env.EXPO_PUBLIC_USDT_ADDRESS_ARBITRUM,
  polygon: process.env.EXPO_PUBLIC_USDT_ADDRESS_POLYGON,
  optimism: process.env.EXPO_PUBLIC_USDT_ADDRESS_OPTIMISM,
  ethereum: process.env.EXPO_PUBLIC_USDT_ADDRESS_ETHEREUM,
  bnb: process.env.EXPO_PUBLIC_USDT_ADDRESS_BNB,
};

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function publicUrl(bucket: string, path?: string | null) {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function getUsdtAddress(chainName?: string | null) {
  if (!chainName) return "";
  return USDT_BY_CHAIN[chainName] ?? "";
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
  const [chainErr, setChainErr] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupSecret, setBackupSecret] = useState("");
  const [backupType, setBackupType] = useState<"mnemonic" | "privateKey">("privateKey");
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendToken, setSendToken] = useState<"USDC" | "USDT">("USDC");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");

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
      setChainErr(null);
      const items = await fetchMarketChains();
      setChains(items);
      const preferred = await getPreferredMarketChain();
      setChain(preferred);
      await refreshWalletMeta(preferred);
    } catch (e: any) {
      setChains([]);
      setChain(null);
      setWallet(null);
      setChainErr(e?.message || "Unable to load network settings. Pull to refresh or try again.");
    }
  }

  async function refreshWalletMeta(selected?: any | null) {
    const current = selected ?? chain;
    const backed = await hasWalletBackup();
    setBackedUp(backed);
    if (!current) {
      setUsdcBalance("0");
      setUsdtBalance("0");
      return;
    }
    const w = await getMyWalletForChain(current.chain);
    setWallet(w ? { address: w.address } : null);
    if (!w?.address) {
      setUsdcBalance("0");
      setUsdtBalance("0");
      return;
    }
    const rpcUrl = getRpcUrlForChain(current);
    if (!rpcUrl) return;
    const client = createPublicClient({
      transport: http(rpcUrl),
    });
    try {
      const usdcRaw = await client.readContract({
        address: current.usdc_address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [w.address as `0x${string}`],
      });
      setUsdcBalance(formatUnits(usdcRaw as bigint, 6));
    } catch {
      setUsdcBalance("0");
    }

    const usdt = getUsdtAddress(current.chain);
    if (!usdt) {
      setUsdtBalance("0");
      return;
    }
    try {
      const usdtRaw = await client.readContract({
        address: usdt as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [w.address as `0x${string}`],
      });
      setUsdtBalance(formatUnits(usdtRaw as bigint, 6));
    } catch {
      setUsdtBalance("0");
    }
  }

  async function onBackupWallet() {
    setWalletErr(null);
    try {
      const auth = await requireLocalAuth("Backup wallet secret");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");
      const secret = await getWalletBackupSecret();
      setBackupType(secret.type);
      setBackupSecret(secret.value);
      setBackupOpen(true);
    } catch (e: any) {
      setWalletErr(e?.message || "Could not open wallet backup.");
    }
  }

  async function onConfirmBackupDone() {
    await markWalletBackedUp();
    setBackedUp(true);
    setBackupOpen(false);
  }

  async function onGenerateOrRegenerateWallet() {
    if (!chain) return;
    setWalletErr(null);
    setWalletBusy(true);
    try {
      const auth = await requireLocalAuth(wallet?.address ? "Regenerate smart wallet" : "Create smart wallet");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");

      if (wallet?.address) {
        if (!backedUp) {
          throw new Error("Back up your current wallet before regenerating.");
        }
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            "Regenerate wallet?",
            "This will create a new wallet key. Ensure your current wallet backup is safely stored. Lost keys cannot be recovered.",
            [
              { text: "Cancel", style: "cancel", onPress: () => reject(new Error("Cancelled")) },
              { text: "I understand, continue", style: "destructive", onPress: () => resolve() },
            ],
          );
        });
        await regenerateWalletKey();
      }

      const res = await ensureSmartAccount(chain);
      setWallet({ address: res.address });
      await refreshWalletMeta(chain);
    } catch (e: any) {
      if (e?.message !== "Cancelled") setWalletErr(e?.message || "Could not generate wallet");
    } finally {
      setWalletBusy(false);
    }
  }

  async function onSendToken() {
    if (!chain || !wallet?.address) return;
    try {
      const auth = await requireLocalAuth(`Send ${sendToken}`);
      if (!auth.ok) throw new Error(auth.message || "Authentication required");

      const to = sendTo.trim();
      const amount = Number(sendAmount);
      if (!/^0x[a-fA-F0-9]{40}$/.test(to)) throw new Error("Enter a valid wallet address.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");

      const tokenAddress = sendToken === "USDC" ? chain.usdc_address : getUsdtAddress(chain.chain);
      if (!tokenAddress) throw new Error(`${sendToken} is not configured for this network.`);

      const amountRaw = BigInt(Math.round(amount * 1_000_000));
      const { client } = await ensureSmartAccount(chain);
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to as `0x${string}`, amountRaw],
      });
      await client.sendTransaction({
        to: tokenAddress as `0x${string}`,
        data,
      });
      setSendOpen(false);
      setSendAmount("");
      setSendTo("");
      await refreshWalletMeta(chain);
    } catch (e: any) {
      setWalletErr(e?.message || "Send failed.");
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
            onPress={async () => {
              await load();
              await loadChains();
            }}
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
            Create your smart account only when youâ€™re ready. We never store your private keys.
          </Text>
          {!!chainErr ? (
            <Text style={{ marginTop: 10, color: "#FCA5A5", fontWeight: "800" }}>{chainErr}</Text>
          ) : null}
          {chains.length === 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 }}>
                No networks available yet.
              </Text>
              <Pressable
                onPress={loadChains}
                style={{
                  marginTop: 10,
                  borderRadius: 16,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Reload networks</Text>
              </Pressable>
            </View>
          ) : (
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
                      await refreshWalletMeta(c);
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
          )}

          <View style={{ marginTop: 10 }}>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 }}>
              {chain?.active ? "Active network" : "Network not active yet"}
            </Text>
            {!chain?.rpc_url && !process.env.EXPO_PUBLIC_ALCHEMY_API_KEY ? (
              <Text style={{ marginTop: 6, color: "#FCA5A5", fontWeight: "800", fontSize: 12 }}>
                Missing RPC URL or Alchemy API key. Add rpc_url in market_chain_config or set EXPO_PUBLIC_ALCHEMY_API_KEY.
              </Text>
            ) : null}
            <Text style={{ marginTop: 6, color: "#fff", fontWeight: "900" }}>
              {wallet?.address ? wallet.address : "No wallet address generated"}
            </Text>
            <Text style={{ marginTop: 8, color: MUTED, fontSize: 12 }}>
              Backup status: {backedUp ? "Backed up" : "Not backed up"}
            </Text>
            <Text style={{ marginTop: 8, color: "#fff", fontWeight: "900", fontSize: 13 }}>
              USDC: {Number(usdcBalance || "0").toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </Text>
            <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900", fontSize: 13 }}>
              USDT: {Number(usdtBalance || "0").toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </Text>
          </View>

          {walletErr ? (
            <Text style={{ marginTop: 10, color: "#FCA5A5", fontWeight: "800" }}>{walletErr}</Text>
          ) : null}

          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <Pressable
              disabled={!wallet?.address}
              onPress={onBackupWallet}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                opacity: wallet?.address ? 1 : 0.6,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Backup</Text>
            </Pressable>
            <Pressable
              disabled={!wallet?.address}
              onPress={async () => {
                if (!wallet?.address) return;
                await Clipboard.setStringAsync(wallet.address);
                Alert.alert("Copied", "Wallet address copied to clipboard.");
              }}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                opacity: wallet?.address ? 1 : 0.6,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Receive</Text>
            </Pressable>
            <Pressable
              disabled={!wallet?.address}
              onPress={() => setSendOpen(true)}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                opacity: wallet?.address ? 1 : 0.6,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Send</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={!chain?.active || walletBusy}
            onPress={onGenerateOrRegenerateWallet}
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
              {walletBusy ? "Working..." : wallet?.address ? "Regenerate wallet" : "Generate wallet"}
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

      <Modal visible={backupOpen} transparent animationType="slide" onRequestClose={() => setBackupOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 }}>
          <View style={{ borderRadius: 20, padding: 16, backgroundColor: "#0F0B1D", borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
              Backup {backupType === "mnemonic" ? "Seed Phrase" : "Private Key"}
            </Text>
            <Text style={{ marginTop: 8, color: MUTED, fontSize: 12 }}>
              Store this offline. Anyone with this can access your wallet.
            </Text>
            <Text selectable style={{ marginTop: 12, color: "#fff", fontWeight: "800", lineHeight: 22 }}>
              {backupSecret}
            </Text>
            <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(backupSecret);
                  Alert.alert("Copied", "Backup secret copied.");
                }}
                style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Copy</Text>
              </Pressable>
              <Pressable
                onPress={onConfirmBackupDone}
                style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(59,130,246,0.30)" }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>I backed it up</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sendOpen} transparent animationType="slide" onRequestClose={() => setSendOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 }}>
          <View style={{ borderRadius: 20, padding: 16, backgroundColor: "#0F0B1D", borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Send Token</Text>
            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
              {(["USDC", "USDT"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setSendToken(t)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: sendToken === t ? "rgba(59,130,246,0.30)" : "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: sendToken === t ? "rgba(59,130,246,0.45)" : "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={sendTo}
              onChangeText={setSendTo}
              placeholder="Recipient address (0x...)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", color: "#fff", paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <TextInput
              value={sendAmount}
              onChangeText={setSendAmount}
              placeholder={`Amount (${sendToken})`}
              placeholderTextColor="rgba(255,255,255,0.45)"
              keyboardType="decimal-pad"
              style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", color: "#fff", paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setSendOpen(false)}
                style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSendToken}
                style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(59,130,246,0.30)" }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

