import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/services/supabase";
import { uploadToSupabaseStorage } from "@/services/market/storageUpload";

type FeedProfile = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string | null;
  logo_path: string | null;
  is_verified: boolean | null;
};

type FeedPost = {
  id: string;
  author_id: string;
  body: string | null;
  created_at: string;
};

type FeedMedia = {
  id: string;
  post_id: string;
  kind: "image" | "video" | "audio" | "file";
  storage_path: string;
  public_url: string | null;
  mime_type: string | null;
  sort_order: number | null;
};

type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: { username?: string | null; full_name?: string | null } | null;
};

type LocalAsset = {
  uri: string;
  mimeType: string;
  kind: "image" | "video";
};

type Props = {
  profileUserId?: string;
  hideComposer?: boolean;
};

const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.10)";
const MUTED = "rgba(255,255,255,0.65)";
const SOCIAL_BUCKET = "market-social";

function fileExtFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("heic")) return "heic";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("quicktime")) return "mov";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "bin";
}

function pickKind(mime: string): "image" | "video" | "audio" | "file" {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

function safePublicUrl(bucket: string, storagePath: string | null, publicUrl: string | null) {
  if (publicUrl) return publicUrl;
  if (!storagePath) return null;
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

function SellerBadge({ verified }: { verified?: boolean | null }) {
  if (!verified) return null;
  return <Ionicons name="checkmark-circle" size={16} color="#3B82F6" />;
}

export default function SocialFeed({ profileUserId, hideComposer = false }: Props) {
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [previewAsset, setPreviewAsset] = useState<LocalAsset | null>(null);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, FeedMedia[]>>({});
  const [profileMap, setProfileMap] = useState<Record<string, FeedProfile>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Record<string, boolean>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const [commentsOpenPost, setCommentsOpenPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, []);

  async function fetchPosts() {
    setLoading(true);
    setError(null);
    try {
      const targetAuthorIds = new Set<string>();

      if (profileUserId) {
        targetAuthorIds.add(profileUserId);
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          targetAuthorIds.add(uid);
          const { data: follows } = await supabase
            .from("market_profile_follows")
            .select("followed_id")
            .eq("follower_id", uid);
          (follows ?? []).forEach((r: any) => targetAuthorIds.add(String(r.followed_id)));
        }
      }

      if (!targetAuthorIds.size) {
        setPosts([]);
        setMediaMap({});
        setProfileMap({});
        setReactionCounts({});
        setMyLikes({});
        setCommentCounts({});
        return;
      }

      const authorIds = Array.from(targetAuthorIds);

      const { data: postRows, error: postErr } = await supabase
        .from("market_social_posts")
        .select("id,author_id,body,created_at")
        .in("author_id", authorIds)
        .order("created_at", { ascending: false })
        .limit(120);

      if (postErr) throw postErr;

      const feedPosts = (postRows ?? []) as FeedPost[];
      setPosts(feedPosts);

      const postIds = feedPosts.map((p) => p.id);
      const authorSet = Array.from(new Set(feedPosts.map((p) => p.author_id)));

      const [mediaRes, profilesRes] = await Promise.all([
        postIds.length
          ? supabase
              .from("market_social_media")
              .select("id,post_id,kind,storage_path,public_url,mime_type,sort_order")
              .in("post_id", postIds)
              .order("sort_order", { ascending: true })
          : Promise.resolve({ data: [] } as any),
        authorSet.length
          ? supabase
              .from("market_seller_public_profiles")
              .select("user_id,market_username,display_name,business_name,logo_path,is_verified")
              .in("user_id", authorSet)
          : Promise.resolve({ data: [] } as any),
      ]);

      const mm: Record<string, FeedMedia[]> = {};
      (mediaRes.data ?? []).forEach((m: FeedMedia) => {
        if (!mm[m.post_id]) mm[m.post_id] = [];
        mm[m.post_id].push(m);
      });
      setMediaMap(mm);

      const pm: Record<string, FeedProfile> = {};
      (profilesRes.data ?? []).forEach((p: FeedProfile) => {
        pm[p.user_id] = p;
      });
      setProfileMap(pm);

      if (postIds.length) {
        const [rcRes, myRes, ccRes] = await Promise.all([
          supabase.from("market_social_reactions").select("post_id").in("post_id", postIds),
          meId
            ? supabase.from("market_social_reactions").select("post_id").eq("user_id", meId).in("post_id", postIds)
            : Promise.resolve({ data: [] } as any),
          supabase.from("market_social_comments").select("post_id").in("post_id", postIds),
        ]);

        const rc: Record<string, number> = {};
        (rcRes.data ?? []).forEach((r: any) => {
          const id = String(r.post_id);
          rc[id] = (rc[id] ?? 0) + 1;
        });
        setReactionCounts(rc);

        const ml: Record<string, boolean> = {};
        (myRes.data ?? []).forEach((r: any) => {
          ml[String(r.post_id)] = true;
        });
        setMyLikes(ml);

        const cc: Record<string, number> = {};
        (ccRes.data ?? []).forEach((r: any) => {
          const id = String(r.post_id);
          cc[id] = (cc[id] ?? 0) + 1;
        });
        setCommentCounts(cc);
      }
    } catch (e: any) {
      setError(e?.message || "Could not load social feed");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPosts();
  }, [profileUserId, meId]);

  useEffect(() => {
    const ch = supabase
      .channel(`market-social-feed-${profileUserId || "home"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_social_posts" }, (payload) => {
        const row = payload.new as any;
        const oldRow = payload.old as any;
        if (payload.eventType === "INSERT" && row?.id) {
          setPosts((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            if (profileUserId && row.author_id !== profileUserId) return prev;
            return [row as FeedPost, ...prev];
          });
        } else if (payload.eventType === "DELETE" && oldRow?.id) {
          setPosts((prev) => prev.filter((p) => p.id !== oldRow.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_social_reactions" }, (payload) => {
        const row = (payload.new ?? payload.old) as any;
        const pid = String(row?.post_id || "");
        if (!pid) return;
        setReactionCounts((prev) => {
          const next = { ...prev };
          if (payload.eventType === "INSERT") next[pid] = (next[pid] ?? 0) + 1;
          else if (payload.eventType === "DELETE") next[pid] = Math.max(0, (next[pid] ?? 0) - 1);
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_social_comments" }, (payload) => {
        const row = (payload.new ?? payload.old) as any;
        const pid = String(row?.post_id || "");
        if (!pid) return;
        setCommentCounts((prev) => {
          const next = { ...prev };
          if (payload.eventType === "INSERT") next[pid] = (next[pid] ?? 0) + 1;
          else if (payload.eventType === "DELETE") next[pid] = Math.max(0, (next[pid] ?? 0) - 1);
          return next;
        });
        if (commentsOpenPost?.id === pid) {
          loadComments(pid);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [profileUserId, commentsOpenPost?.id]);

  async function chooseMedia() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo/video permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.9,
    });

    if (result.canceled) return;

    const next = (result.assets ?? [])
      .filter((a) => !!a.uri)
      .map((a) => {
        const mime = a.mimeType || (a.type === "video" ? "video/mp4" : "image/jpeg");
        return {
          uri: a.uri,
          mimeType: mime,
          kind: a.type === "video" ? "video" : "image",
        } as LocalAsset;
      });

    setAssets((prev) => [...prev, ...next].slice(0, 4));
  }

  async function uploadAsset(userId: string, postId: string, asset: LocalAsset, idx: number): Promise<FeedMedia> {
    const ext = fileExtFromMime(asset.mimeType);
    const path = `${userId}/${postId}/${Date.now()}-${idx}.${ext}`;
    await uploadToSupabaseStorage({
      bucket: SOCIAL_BUCKET,
      path,
      localUri: asset.uri,
      contentType: asset.mimeType,
      upsert: false,
    });

    const { data: inserted, error: mediaErr } = await supabase
      .from("market_social_media")
      .insert({
        post_id: postId,
        kind: pickKind(asset.mimeType),
        storage_path: path,
        public_url: null,
        mime_type: asset.mimeType,
        sort_order: idx,
      })
      .select("id,post_id,kind,storage_path,public_url,mime_type,sort_order")
      .single();
    if (mediaErr) throw mediaErr;

    return inserted as FeedMedia;
  }

  async function submitPost() {
    const cleanBody = body.trim();
    if (!cleanBody && assets.length === 0) return;
    if (!meId) {
      setError("Please sign in to post.");
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const { data: inserted, error: postErr } = await supabase
        .from("market_social_posts")
        .insert({ author_id: meId, body: cleanBody || null })
        .select("id,author_id,body,created_at")
        .single();
      if (postErr) throw postErr;

      const created = inserted as FeedPost;
      const createdMedia: FeedMedia[] = [];
      for (let i = 0; i < assets.length; i += 1) {
        createdMedia.push(await uploadAsset(meId, created.id, assets[i], i));
      }

      setPosts((prev) => [created, ...prev]);
      if (createdMedia.length) {
        setMediaMap((prev) => ({ ...prev, [created.id]: createdMedia }));
      }

      setBody("");
      setAssets([]);
    } catch (e: any) {
      const msg = String(e?.message || "Could not publish post");
      if (msg.toLowerCase().includes("row-level security")) {
        setError("Upload blocked by storage/table policy. Add insert policy for your user on bucket: market-social.");
      } else {
        setError(msg);
      }
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(postId: string) {
    if (!meId) {
      setError("Please sign in to react.");
      return;
    }

    const liked = !!myLikes[postId];
    setMyLikes((prev) => ({ ...prev, [postId]: !liked }));
    setReactionCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) + (liked ? -1 : 1)) }));

    try {
      if (liked) {
        await supabase.from("market_social_reactions").delete().eq("post_id", postId).eq("user_id", meId);
      } else {
        await supabase
          .from("market_social_reactions")
          .upsert({ post_id: postId, user_id: meId, reaction: "like" }, { onConflict: "post_id,user_id" });
      }
    } catch {
      setMyLikes((prev) => ({ ...prev, [postId]: liked }));
      setReactionCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 0) + (liked ? 1 : -1)) }));
    }
  }

  async function loadComments(postId: string) {
    const { data } = await supabase
      .from("market_social_comments")
      .select("id,post_id,user_id,body,created_at,profiles(username,full_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(120);
    setComments((data ?? []) as FeedComment[]);
  }

  async function openComments(post: FeedPost) {
    setCommentsOpenPost(post);
    setCommentText("");
    await loadComments(post.id);
  }

  async function submitComment() {
    if (!commentsOpenPost || !meId) return;
    const txt = commentText.trim();
    if (!txt) return;

    setCommentBusy(true);
    try {
      const { data: ins } = await supabase
        .from("market_social_comments")
        .insert({ post_id: commentsOpenPost.id, user_id: meId, body: txt })
        .select("id,post_id,user_id,body,created_at")
        .single();

      if (ins) setComments((prev) => [ins as FeedComment, ...prev]);
      setCommentText("");
    } finally {
      setCommentBusy(false);
    }
  }

  function renderPost(p: FeedPost) {
    const author = profileMap[p.author_id];
    const media = mediaMap[p.id] ?? [];
    const avatar = author?.logo_path
      ? supabase.storage.from("market-sellers").getPublicUrl(author.logo_path).data.publicUrl
      : null;

    return (
      <View key={p.id} style={{ marginTop: 12, borderRadius: 18, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, overflow: "hidden" }}>
        <View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" }}>
            {avatar ? <Image source={{ uri: avatar }} style={{ width: 38, height: 38 }} /> : <Ionicons name="person-outline" size={18} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>{author?.business_name || author?.display_name || "Business"}</Text>
              <SellerBadge verified={author?.is_verified} />
            </View>
            <Text style={{ color: MUTED, fontSize: 12 }}>@{author?.market_username || "store"} - {new Date(p.created_at).toLocaleString()}</Text>
          </View>
        </View>

        {p.body ? <Text style={{ color: "rgba(255,255,255,0.88)", lineHeight: 20, paddingHorizontal: 12, paddingBottom: 10 }}>{p.body}</Text> : null}

        {media.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
            {media.map((m) => {
              const uri = safePublicUrl(SOCIAL_BUCKET, m.storage_path, m.public_url);
              const isImage = m.kind === "image";
              return (
                <Pressable key={m.id} onPress={() => uri && setPreviewAsset({ uri, kind: isImage ? "image" : "video", mimeType: m.mime_type || "" })}>
                  <View style={{ width: 168, height: 168, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: BORDER, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                    {isImage && uri ? (
                      <Image source={{ uri }} style={{ width: 168, height: 168 }} />
                    ) : (
                      <>
                        <Ionicons name={m.kind === "video" ? "videocam-outline" : m.kind === "audio" ? "musical-notes-outline" : "document-outline"} size={28} color="#fff" />
                        <Text style={{ marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12 }}>{m.kind.toUpperCase()}</Text>
                        <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.45)", fontSize: 10 }}>Tap to preview</Text>
                      </>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", gap: 16 }}>
          <Pressable onPress={() => toggleLike(p.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name={myLikes[p.id] ? "heart" : "heart-outline"} size={18} color={myLikes[p.id] ? "#EF4444" : "#fff"} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>{reactionCounts[p.id] ?? 0}</Text>
          </Pressable>

          <Pressable onPress={() => openComments(p)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800" }}>{commentCounts[p.id] ?? 0}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      {!hideComposer ? (
        <View style={{ borderRadius: 18, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 10 }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Share update with your followers..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{ minHeight: 72, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.04)", padding: 10, color: "#fff", textAlignVertical: "top" }}
          />

          {assets.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {assets.map((a, idx) => (
                <Pressable key={`${a.uri}-${idx}`} onPress={() => setPreviewAsset(a)}>
                  <View style={{ width: 86, height: 86, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: BORDER }}>
                    {a.kind === "image" ? (
                      <Image source={{ uri: a.uri }} style={{ width: 86, height: 86 }} />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="videocam-outline" color="#fff" size={22} />
                      </View>
                    )}
                    <Pressable
                      onPress={() => setAssets((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ position: "absolute", right: 4, top: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
            <Pressable onPress={chooseMedia} style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Ionicons name="images-outline" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "900" }}>Add media</Text>
            </Pressable>
            <Pressable onPress={submitPost} disabled={posting} style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(124,58,237,0.45)", backgroundColor: "rgba(124,58,237,0.25)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>{posting ? "Posting..." : "Post"}</Text>
            </Pressable>
          </View>

          {error ? <Text style={{ marginTop: 8, color: "#FCA5A5", fontSize: 12 }}>{error}</Text> : null}
        </View>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: 18, alignItems: "center" }}>
          <ActivityIndicator color="#fff" />
          <Text style={{ marginTop: 8, color: MUTED }}>Loading feed...</Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 14 }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>No posts yet</Text>
          <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>Follow businesses to see their updates.</Text>
        </View>
      ) : (
        <View>{posts.map(renderPost)}</View>
      )}

      <Modal visible={!!previewAsset} transparent animationType="fade" onRequestClose={() => setPreviewAsset(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", padding: 16, justifyContent: "center" }}>
          <Pressable onPress={() => setPreviewAsset(null)} style={{ position: "absolute", right: 16, top: 48, zIndex: 5 }}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </Pressable>
          {previewAsset?.kind === "image" ? (
            <Image source={{ uri: previewAsset.uri }} style={{ width: "100%", height: "70%", borderRadius: 16 }} resizeMode="contain" />
          ) : (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 18 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Media preview</Text>
              <Text style={{ marginTop: 8, color: MUTED }}>
                Video/audio preview is limited on this build. You can still upload and play after native media modules are included.
              </Text>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={!!commentsOpenPost} transparent animationType="slide" onRequestClose={() => setCommentsOpenPost(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <View style={{ maxHeight: "82%", borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: "#0B0915", borderTopWidth: 1, borderColor: BORDER, padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Comments</Text>
              <Pressable onPress={() => setCommentsOpenPost(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ paddingBottom: 14 }}>
              {comments.length === 0 ? (
                <Text style={{ color: MUTED }}>No comments yet.</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 10, marginBottom: 8 }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>@{c.profiles?.username || c.profiles?.full_name || "user"}</Text>
                    <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.8)" }}>{c.body}</Text>
                    <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{new Date(c.created_at).toLocaleString()}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.05)", color: "#fff", paddingHorizontal: 10, paddingVertical: 10 }}
              />
              <Pressable
                disabled={commentBusy}
                onPress={submitComment}
                style={{ width: 56, borderRadius: 12, borderWidth: 1, borderColor: "rgba(124,58,237,0.45)", backgroundColor: "rgba(124,58,237,0.25)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
