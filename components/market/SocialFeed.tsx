import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View } from "react-native";

import { uploadToSupabaseStorage } from "@/services/market/storageUpload";
import { supabase } from "@/services/supabase";

type PostRow = {
  id: string;
  author_id: string;
  body: string | null;
  media: any;
  created_at: string;
  seller?: {
    market_username?: string | null;
    display_name?: string | null;
    business_name?: string | null;
    logo_path?: string | null;
    is_verified?: boolean | null;
  } | null;
};

type Stats = { likes: number; comments: number; reshares: number; myLiked: boolean };

function logoUrl(path?: string | null) {
  if (!path) return null;
  return supabase.storage.from("market-sellers").getPublicUrl(path).data.publicUrl;
}

function getDocumentPicker() {
  try {
    return require("expo-document-picker");
  } catch {
    return null;
  }
}

export default function SocialFeed({ profileUserId, hideComposer = false }: { profileUserId?: string; hideComposer?: boolean }) {
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [q, setQ] = useState("");
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<{ kind: "image" | "video" | "audio"; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isHandleSearch = q.trim().startsWith("@");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setMeId(uid);

      let authorIds: string[] | null = null;
      if (profileUserId) {
        authorIds = [profileUserId];
      } else if (uid) {
        const { data: follows } = await supabase
          .from("market_profile_follows")
          .select("followed_id")
          .eq("follower_id", uid);
        const ids = (follows ?? []).map((f: any) => String(f.followed_id));
        authorIds = Array.from(new Set([uid, ...ids]));
      } else {
        authorIds = [];
      }

      if (isHandleSearch) {
        const uname = q.trim().replace(/^@/, "").toLowerCase();
        const { data: seller } = await supabase
          .from("market_seller_public_profiles")
          .select("user_id")
          .eq("market_username", uname)
          .maybeSingle();
        authorIds = seller?.user_id ? [String(seller.user_id)] : [];
      }

      if (!authorIds?.length) {
        setPosts([]);
        setStats({});
        return;
      }

      let query = supabase
        .from("market_social_posts")
        .select("id,author_id,body,media,created_at")
        .in("author_id", authorIds)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(60);

      if (q.trim() && !isHandleSearch) {
        query = query.ilike("body", `%${q.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as PostRow[];
      const authorSet = Array.from(new Set(rows.map((r) => r.author_id)));
      const { data: sellers } = await supabase
        .from("market_seller_public_profiles")
        .select("user_id,market_username,display_name,business_name,logo_path,is_verified")
        .in("user_id", authorSet);
      const sellerMap = new Map((sellers ?? []).map((s: any) => [String(s.user_id), s]));
      const merged = rows.map((r) => ({ ...r, seller: sellerMap.get(r.author_id) ?? null }));
      setPosts(merged);

      const nextStats: Record<string, Stats> = {};
      await Promise.all(
        merged.map(async (row) => {
          const [{ count: likes }, { count: comments }, { count: reshares }, my] = await Promise.all([
            supabase.from("market_social_post_reactions").select("id", { count: "exact", head: true }).eq("post_id", row.id),
            supabase.from("market_social_post_comments").select("id", { count: "exact", head: true }).eq("post_id", row.id),
            supabase.from("market_social_post_reshares").select("id", { count: "exact", head: true }).eq("post_id", row.id),
            uid
              ? supabase.from("market_social_post_reactions").select("id").eq("post_id", row.id).eq("user_id", uid).maybeSingle()
              : Promise.resolve({ data: null } as any),
          ]);
          nextStats[row.id] = {
            likes: likes ?? 0,
            comments: comments ?? 0,
            reshares: reshares ?? 0,
            myLiked: !!my?.data?.id,
          };
        }),
      );
      setStats(nextStats);
    } catch (e: any) {
      setErr(e?.message || "Failed to load social feed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [profileUserId]);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ch = supabase
      .channel(`social-feed-${profileUserId || "home"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_social_posts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "market_social_post_reactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "market_social_post_comments" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profileUserId, meId]);

  async function pickImageOrVideo() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      allowsEditing: false,
    });
    if (picked.canceled) return;
    const a = picked.assets?.[0];
    if (!a?.uri) return;
    const kind: "image" | "video" = a.type === "video" ? "video" : "image";
    const ext = kind === "video" ? "mp4" : "jpg";
    const path = `posts/${meId}/${Date.now()}.${ext}`;
    const up = await uploadToSupabaseStorage({
      bucket: "market-social",
      path,
      localUri: a.uri,
      contentType: kind === "video" ? "video/mp4" : "image/jpeg",
      upsert: false,
    });
    setMedia({ kind, url: up.publicUrl || "" });
  }

  async function pickAudio() {
    const picker = getDocumentPicker();
    if (!picker?.getDocumentAsync) {
      setErr("Audio picker needs a dev build with expo-document-picker.");
      return;
    }
    const picked = await picker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (picked.canceled) return;
    const a = picked.assets?.[0];
    if (!a?.uri) return;
    const path = `posts/${meId}/${Date.now()}.m4a`;
    const up = await uploadToSupabaseStorage({
      bucket: "market-social",
      path,
      localUri: a.uri,
      contentType: a.mimeType || "audio/m4a",
      upsert: false,
    });
    setMedia({ kind: "audio", url: up.publicUrl || "" });
  }

  async function createPost() {
    if (!meId) return setErr("Please sign in first.");
    if (!body.trim() && !media) return setErr("Write something or attach media.");
    setPosting(true);
    setErr(null);
    try {
      const { error } = await supabase.from("market_social_posts").insert({
        author_id: meId,
        body: body.trim() || null,
        media: media ? [media] : [],
        visibility: "followers",
      });
      if (error) throw error;
      setBody("");
      setMedia(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(postId: string) {
    if (!meId) return;
    const st = stats[postId];
    try {
      if (st?.myLiked) {
        await supabase.from("market_social_post_reactions").delete().eq("post_id", postId).eq("user_id", meId);
      } else {
        await supabase.from("market_social_post_reactions").insert({ post_id: postId, user_id: meId, reaction: "like" });
      }
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not react");
    }
  }

  async function reshare(postId: string) {
    if (!meId) return;
    try {
      await supabase.from("market_social_post_reshares").insert({ post_id: postId, user_id: meId });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not reshare");
    }
  }

  async function addComment(postId: string) {
    if (!meId) return;
    const text = String(commentDraft[postId] ?? "").trim();
    if (!text) return;
    try {
      const { error } = await supabase.from("market_social_post_comments").insert({ post_id: postId, user_id: meId, body: text });
      if (error) throw error;
      setCommentDraft((prev) => ({ ...prev, [postId]: "" }));
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not comment");
    }
  }

  const emptyText = useMemo(() => {
    if (profileUserId) return "No posts from this profile yet.";
    return "Follow business accounts to see their posts in your feed.";
  }, [profileUserId]);

  return (
    <View style={{ marginTop: 12 }}>
      <View
        style={{
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.75)" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder='Search posts... use "@username" for accounts'
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={{ flex: 1, color: "#fff", fontWeight: "700" }}
        />
      </View>

      {!hideComposer ? (
        <View
          style={{
            marginTop: 10,
            borderRadius: 16,
            padding: 12,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
          }}
        >
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share update with your followers..."
            placeholderTextColor="rgba(255,255,255,0.45)"
            multiline
            style={{ color: "#fff", minHeight: 70, textAlignVertical: "top" }}
          />

          {media ? (
            <View style={{ marginTop: 8, padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>Attached: {media.kind}</Text>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }} numberOfLines={1}>{media.url}</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
            <Pressable onPress={pickImageOrVideo} style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Image / Video</Text>
            </Pressable>
            <Pressable onPress={pickAudio} style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Audio</Text>
            </Pressable>
            <Pressable disabled={posting} onPress={createPost} style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "rgba(124,58,237,0.25)", borderWidth: 1, borderColor: "rgba(124,58,237,0.5)", opacity: posting ? 0.7 : 1 }}>
              {posting ? <ActivityIndicator /> : <Text style={{ color: "#fff", fontWeight: "900" }}>Post</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {!!err ? <Text style={{ marginTop: 8, color: "#FCA5A5", fontWeight: "800" }}>{err}</Text> : null}

      {loading ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <ActivityIndicator />
        </View>
      ) : posts.length === 0 ? (
        <Text style={{ marginTop: 12, color: "rgba(255,255,255,0.65)" }}>{emptyText}</Text>
      ) : (
        <FlatList
          data={posts}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 10, gap: 10 }}
          renderItem={({ item }) => {
            const st = stats[item.id] ?? { likes: 0, comments: 0, reshares: 0, myLiked: false };
            const mediaItems: any[] = Array.isArray(item.media) ? item.media : [];
            const pic = logoUrl(item.seller?.logo_path);
            return (
              <View style={{ borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                    {pic ? <Image source={{ uri: pic }} style={{ width: 36, height: 36 }} /> : <Ionicons name="person-outline" size={18} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "900" }}>
                      {item.seller?.business_name || item.seller?.display_name || "Business"}
                      {item.seller?.is_verified ? " ✓" : ""}
                    </Text>
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>@{item.seller?.market_username || "profile"} ? {new Date(item.created_at).toLocaleString()}</Text>
                  </View>
                </View>

                {!!item.body ? <Text style={{ marginTop: 10, color: "#fff", lineHeight: 20 }}>{item.body}</Text> : null}

                {mediaItems.length > 0 ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {mediaItems.map((m, idx) => (
                      <View key={`${item.id}-${idx}`} style={{ borderRadius: 12, padding: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
                        {m.kind === "image" || m.kind === "video" ? (
                          <Image source={{ uri: m.url }} style={{ width: "100%", height: 220, borderRadius: 10 }} resizeMode="cover" />
                        ) : (
                          <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>Audio attached</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 18 }}>
                  <Pressable onPress={() => toggleLike(item.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name={st.myLiked ? "heart" : "heart-outline"} size={18} color={st.myLiked ? "#F87171" : "#fff"} />
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{st.likes}</Text>
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{st.comments}</Text>
                  </View>
                  <Pressable onPress={() => reshare(item.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="repeat-outline" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{st.reshares}</Text>
                  </Pressable>
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TextInput
                    value={commentDraft[item.id] || ""}
                    onChangeText={(v) => setCommentDraft((prev) => ({ ...prev, [item.id]: v }))}
                    placeholder="Write comment..."
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    style={{ flex: 1, color: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", paddingHorizontal: 10, paddingVertical: 8 }}
                  />
                  <Pressable onPress={() => addComment(item.id)} style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "rgba(124,58,237,0.25)", borderWidth: 1, borderColor: "rgba(124,58,237,0.5)" }}>
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>Comment</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
