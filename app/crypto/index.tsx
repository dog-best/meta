import { useCrypto } from "@/services/crypto/useCrypto";
import { Link } from "expo-router";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { isNigeriaCountry, resolveUserCountry, type UserCountry } from "@/utils/country";

export default function CryptoHome() {
  const { loading, error, depositAddress, refreshWallet } = useCrypto();
  const [userCountry, setUserCountry] = React.useState<UserCountry | undefined>(undefined);
  const isNigeria = isNigeriaCountry(userCountry?.code || userCountry?.name);
  const countryResolved = userCountry !== undefined;

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const c = await resolveUserCountry({ prompt: true });
        if (mounted) setUserCountry(c);
      } catch {
        if (mounted) setUserCountry(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View className="flex-1 bg-white p-4 gap-4">
      <Text className="text-xl font-semibold">Crypto</Text>

      <View className="border rounded-xl p-4">
        <Text className="font-medium">Your Deposit Address</Text>
        {loading ? (
          <View className="py-3"><ActivityIndicator /></View>
        ) : depositAddress ? (
          <Text selectable className="mt-2 text-gray-800">{depositAddress}</Text>
        ) : (
          <Text className="mt-2 text-gray-500">No address yet. Tap refresh.</Text>
        )}
        {error && <Text className="mt-2 text-red-500">{error}</Text>}
        <TouchableOpacity
          onPress={refreshWallet}
          className="mt-3 bg-blue-600 rounded-xl p-3"
        >
          <Text className="text-white text-center font-semibold">Refresh</Text>
        </TouchableOpacity>
      </View>

      {!countryResolved ? (
        <View className="border rounded-xl p-4">
          <Text className="mt-2 text-gray-500">Checking region settings...</Text>
        </View>
      ) : isNigeria ? (
        <Link href="/crypto/convert" asChild>
          <TouchableOpacity className="bg-black rounded-xl p-4">
            <Text className="text-white text-center font-semibold">Convert Crypto to NGN</Text>
          </TouchableOpacity>
        </Link>
      ) : (
        <View className="border rounded-xl p-4">
          <Text className="font-medium">NGN Conversion Disabled</Text>
          <Text className="mt-2 text-gray-500">Crypto-to-NGN conversion is available only in Nigeria.</Text>
        </View>
      )}

      <Text className="text-gray-500 text-xs">
        Note: Deposits require your Alchemy webhook + Edge Functions to be deployed in Supabase.
      </Text>
    </View>
  );
}
