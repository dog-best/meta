import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { supabase } from "@/services/supabase";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Social = {
  id: string;
  name: "twitter" | "discord" | "telegram";
  url: string;
  visible: boolean;
};

export default function News({ visible, onClose }: Props) {
  const [news, setNews] = useState<any[]>([]);
  const [socials, setSocials] = useState<Social[]>([]);
  const [loading, setLoading] = useState(true);

  /* -------------------------------------------------
     FETCH NEWS + SOCIALS
  -------------------------------------------------- */
  useEffect(() => {
    if (!visible) return;

    let channel: any;

    const fetchAll = async () => {
      console.log("[News] load start");
      setLoading(true);

      try {
        const [{ data: newsData }, { data: socialData }] = await Promise.all([
          supabase
            .from("vad_news")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("vad_socials").select("*"),
        ]);

        if (newsData) setNews(newsData);
        if (socialData) setSocials(socialData);
      } finally {
        setLoading(false);
        console.log("[News] load end");
      }
    };

    fetchAll();

    channel = supabase
      .channel("vad-news-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vad_news" },
        fetchAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vad_socials" },
        fetchAll
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [visible]);

  /* -------------------------------------------------
     ICON MAPPER
  -------------------------------------------------- */
  const iconMap: Record<string, string> = {
    twitter: "logo-twitter",
    discord: "logo-discord",
    telegram: "paper-plane",
  };

  /* -------------------------------------------------
     UI
  -------------------------------------------------- */
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* HEADER */}
          <View style={styles.header}>
            <Text style={styles.title}>Latest News</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>

          {/* SOCIALS */}
          <View style={styles.socialRow}>
            {socials
              .filter((s) => s.visible)
              .map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => Linking.openURL(s.url)}
                  style={styles.socialBtn}
                >
                  <Ionicons
                    name={iconMap[s.name] as any}
                    size={22}
                    color="#8B5CF6"
                  />
                </Pressable>
              ))}
          </View>

          {/* CONTENT */}
          {loading ? (
            <ActivityIndicator
              size="large"
              color="#8B5CF6"
              style={{ marginTop: 40 }}
            />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {news.map((n) => (
                <Pressable
                  key={n.id}
                  style={styles.newsBlock}
                  onPress={() => n.link && Linking.openURL(n.link)}
                >
                  {n.image_url && (
                    <Image
                      source={{ uri: n.image_url }}
                      style={styles.image}
                    />
                  )}
                  <Text style={styles.headline}>{n.title}</Text>
                  <Text style={styles.body}>{n.body}</Text>

                  {n.link && (
                    <Text style={styles.readMore}>Read more →</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------
   STYLES
-------------------------------------------------- */
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  card: {
    height: "85%",
    backgroundColor: "#060B1A",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  socialRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 14,
  },
  socialBtn: {
    marginHorizontal: 12,
    padding: 10,
    backgroundColor: "rgba(139,92,246,0.15)",
    borderRadius: 14,
  },
  newsBlock: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  image: {
    height: 160,
    borderRadius: 12,
    marginBottom: 10,
  },
  headline: {
    color: "#8B5CF6",
    fontWeight: "800",
    marginBottom: 6,
  },
  body: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
  },
  readMore: {
    marginTop: 8,
    color: "#8B5CF6",
    fontWeight: "700",
    fontSize: 12,
  },
});
