import { Ionicons } from "@expo/vector-icons";
import { Audio, ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import {
  DMMessage,
  DMAttachment,
  fetchMessages,
  getOrCreateThread,
  getUserByUsername,
  markRead,
  sendMedia,
  sendText,
} from "@/services/dm/dmService";
import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.10)";
const MUTED = "rgba(255,255,255,0.62)";

function formatTime(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isMine(senderId: string, meId: string | null) {
  return !!meId && senderId === meId;
}

export default function DMChat() {
  const insets = useSafeAreaInsets();
  const { username } = useLocalSearchParams<{ username: string }>();
  const handle = useMemo(() => String(username || "").trim().toLowerCase(), [username]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [other, setOther] = useState<any>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);

  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [videoViewer, setVideoViewer] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const me = auth?.user;
        if (!me) {
          router.replace("/(auth)/login" as any);
          return;
        }
        setMeId(me.id);

        const user = await getUserByUsername(handle);
        if (!user) {
          setErr("User not found");
          setOther(null);
          return;
        }

        setOther(user);
        const tid = await getOrCreateThread(user.id);
        setThreadId(tid);
        const msgs = await fetchMessages(tid, 120);
        setMessages(msgs);
        await markRead(tid);
      } catch (e: any) {
        if (mounted) setErr(e?.message || "Failed to open chat");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [handle]);

  useEffect(() => {
    if (!threadId) return;
    const ch = supabase
      .channel(`dm-thread-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        async () => {
          const msgs = await fetchMessages(threadId, 120);
          setMessages(msgs);
          await markRead(threadId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadId]);

  async function onSendText() {
    const value = text.trim();
    if (!value || !threadId) return;
    setSending(true);
    try {
      await sendText(threadId, value);
      setText("");
      const msgs = await fetchMessages(threadId, 120);
      setMessages(msgs);
      await markRead(threadId);
    } catch (e: any) {
      setErr(e?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function onPickImage(fromCamera: boolean) {
    setErr(null);
    if (!threadId) return;
    try {
      if (fromCamera) {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (!camPerm.granted) throw new Error("Camera permission denied");
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libPerm.granted) throw new Error("Media library permission denied");
      }

      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          });

      if (res.canceled || !res.assets?.[0]?.uri) return;
      setSending(true);
      await sendMedia({ threadId, kind: "image", uri: res.assets[0].uri, mime_type: res.assets[0].mimeType ?? "image/jpeg" });
      const msgs = await fetchMessages(threadId, 120);
      setMessages(msgs);
      await markRead(threadId);
    } catch (e: any) {
      setErr(e?.message || "Image upload failed");
    } finally {
      setSending(false);
    }
  }

  async function onPickVideo(fromCamera: boolean) {
    setErr(null);
    if (!threadId) return;
    try {
      if (fromCamera) {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (!camPerm.granted) throw new Error("Camera permission denied");
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libPerm.granted) throw new Error("Media library permission denied");
      }

      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            quality: 1,
          });

      if (res.canceled || !res.assets?.[0]?.uri) return;
      setSending(true);
      await sendMedia({
        threadId,
        kind: "video",
        uri: res.assets[0].uri,
        mime_type: res.assets[0].mimeType ?? "video/mp4",
        duration_sec: res.assets[0].duration ? Math.round(res.assets[0].duration / 1000) : null,
      });
      const msgs = await fetchMessages(threadId, 120);
      setMessages(msgs);
      await markRead(threadId);
    } catch (e: any) {
      setErr(e?.message || "Video upload failed");
    } finally {
      setSending(false);
    }
  }

  async function toggleRecord() {
    if (!threadId) return;
    if (recording) {
      setRecordingBusy(true);
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        const status = await recording.getStatusAsync();
        setRecording(null);
        if (!uri) throw new Error("Recording failed");
        setSending(true);
        await sendMedia({
          threadId,
          kind: "audio",
          uri,
          mime_type: "audio/m4a",
          duration_sec: status?.durationMillis ? Math.round(status.durationMillis / 1000) : null,
        });
        const msgs = await fetchMessages(threadId, 120);
        setMessages(msgs);
        await markRead(threadId);
      } catch (e: any) {
        setErr(e?.message || "Audio upload failed");
      } finally {
        setRecordingBusy(false);
        setSending(false);
      }
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) throw new Error("Microphone permission denied");
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecording(rec);
    } catch (e: any) {
      setErr(e?.message || "Could not start recording");
    }
  }

  const title = other?.seller_profile?.active
    ? other?.seller_profile?.business_name || other?.seller_profile?.market_username || "Business"
    : other?.full_name || other?.username || "User";
  const subtitle = other?.seller_profile?.active
    ? `@${other?.seller_profile?.market_username ?? other?.username ?? "seller"}`
    : `@${other?.username ?? "user"}`;

  if (loading) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <AppHeader title="Chat" />
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: MUTED }}>Opening chatâ€¦</Text>
      </LinearGradient>
    );
  }

  if (err && !threadId) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
        <AppHeader title="Chat" />
        <View style={{ marginTop: 16, borderRadius: 22, padding: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>Could not open chat</Text>
          <Text style={{ marginTop: 8, color: MUTED }}>{err}</Text>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 12, borderRadius: 18, paddingVertical: 12, alignItems: "center", backgroundColor: PURPLE, borderWidth: 1, borderColor: PURPLE }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Go back</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingTop: Math.max(insets.top, 14) }}>
      <AppHeader title="Chat" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <Pressable
              onPress={() => router.back()}
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
                {title}
              </Text>
              <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>{subtitle}</Text>
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={{ marginTop: 12, borderRadius: 22, padding: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Start the conversation</Text>
              <Text style={{ marginTop: 6, color: MUTED }}>Send a message, image, video, or voice note.</Text>
            </View>
          ) : null}

          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              mine={isMine(m.sender_id, meId)}
              onViewImage={setImageViewer}
              onViewVideo={setVideoViewer}
            />
          ))}
        </ScrollView>

        {err ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Text style={{ color: "#FCA5A5", fontWeight: "800", fontSize: 12 }}>{err}</Text>
          </View>
        ) : null}

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(5,4,11,0.92)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              onPress={() => onPickImage(false)}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="image-outline" size={18} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => onPickImage(true)}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="camera-outline" size={18} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => onPickVideo(false)}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="videocam-outline" size={18} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => onPickVideo(true)}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="camera-reverse-outline" size={18} color="#fff" />
            </Pressable>
            <Pressable
              onPress={toggleRecord}
              disabled={recordingBusy}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: recording ? "rgba(239,68,68,0.35)" : CARD,
                borderWidth: 1,
                borderColor: recording ? "rgba(239,68,68,0.65)" : BORDER,
                alignItems: "center",
                justifyContent: "center",
                opacity: recordingBusy ? 0.6 : 1,
              }}
            >
              <Ionicons name={recording ? "stop-circle-outline" : "mic-outline"} size={18} color="#fff" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Type a message..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: "#fff",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              />
            </View>

            <Pressable
              onPress={onSendText}
              disabled={sending || !text.trim()}
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                backgroundColor: PURPLE,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.2)",
                alignItems: "center",
                justifyContent: "center",
                opacity: sending || !text.trim() ? 0.6 : 1,
              }}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!imageViewer} transparent animationType="fade" onRequestClose={() => setImageViewer(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" }}>
          <Pressable onPress={() => setImageViewer(null)} style={{ position: "absolute", top: insets.top + 12, right: 16 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {imageViewer ? <Image source={{ uri: imageViewer }} style={{ width: "100%", height: "80%" }} resizeMode="contain" /> : null}
        </View>
      </Modal>

      <Modal visible={!!videoViewer} transparent animationType="fade" onRequestClose={() => setVideoViewer(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" }}>
          <Pressable onPress={() => setVideoViewer(null)} style={{ position: "absolute", top: insets.top + 12, right: 16 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {videoViewer ? (
            <Video
              source={{ uri: videoViewer }}
              style={{ width: "100%", height: "60%" }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          ) : null}
        </View>
      </Modal>
    </LinearGradient>
  );
}

function MessageBubble({
  message,
  mine,
  onViewImage,
  onViewVideo,
}: {
  message: DMMessage;
  mine: boolean;
  onViewImage: (url: string) => void;
  onViewVideo: (url: string) => void;
}) {
  const attachments = (message.dm_message_attachments ?? []) as DMAttachment[];
  return (
    <View
      style={{
        marginTop: 8,
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "82%",
      }}
    >
      <View
        style={{
          padding: 12,
          borderRadius: 16,
          backgroundColor: mine ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: mine ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.10)",
        }}
      >
        {message.body ? (
          <Text style={{ color: "#fff", fontWeight: "800", lineHeight: 20 }}>{message.body}</Text>
        ) : null}

        {attachments.length > 0 ? (
          <View style={{ marginTop: message.body ? 8 : 0, gap: 8 }}>
            {attachments.map((a) => (
              <AttachmentView key={a.id} attachment={a} onViewImage={onViewImage} onViewVideo={onViewVideo} />
            ))}
          </View>
        ) : null}
      </View>
      <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.5)", fontSize: 10, textAlign: mine ? "right" : "left" }}>
        {formatTime(message.created_at)}
      </Text>
    </View>
  );
}

function AttachmentView({
  attachment,
  onViewImage,
  onViewVideo,
}: {
  attachment: DMAttachment;
  onViewImage: (url: string) => void;
  onViewVideo: (url: string) => void;
}) {
  const url = attachment.public_url || "";

  if (attachment.kind === "image") {
    return (
      <Pressable onPress={() => onViewImage(url)} style={{ borderRadius: 12, overflow: "hidden" }}>
        <Image source={{ uri: url }} style={{ width: 220, height: 160 }} />
      </Pressable>
    );
  }

  if (attachment.kind === "video") {
    return (
      <Pressable onPress={() => onViewVideo(url)} style={{ width: 220, height: 160, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="play-circle-outline" size={36} color="#fff" />
      </Pressable>
    );
  }

  if (attachment.kind === "audio") {
    return <AudioPlayer url={url} duration={attachment.duration_sec ?? null} />;
  }

  return (
    <View style={{ padding: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)" }}>
      <Text style={{ color: "#fff", fontWeight: "800" }}>Attachment</Text>
    </View>
  );
}

function AudioPlayer({ url, duration }: { url: string; duration: number | null }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  async function toggle() {
    if (!url) return;
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (status) => {
        if (!status.isLoaded) return;
        setProgress(status.positionMillis / (status.durationMillis || 1));
        setPlaying(status.isPlaying);
      });
      setSound(s);
      setPlaying(true);
      return;
    }

    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await sound.pauseAsync();
      setPlaying(false);
    } else {
      await sound.playAsync();
      setPlaying(true);
    }
  }

  const pct = Math.max(0, Math.min(1, progress || 0));

  return (
    <Pressable
      onPress={toggle}
      style={{
        padding: 10,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.08)",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Ionicons name={playing ? "pause-circle-outline" : "play-circle-outline"} size={22} color="#fff" />
      <View style={{ flex: 1 }}>
        <View style={{ height: 4, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.2)" }}>
          <View style={{ height: 4, width: `${pct * 100}%`, borderRadius: 4, backgroundColor: PURPLE }} />
        </View>
        <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 10 }}>
          {duration ? `${duration}s` : "Voice note"}
        </Text>
      </View>
    </Pressable>
  );
}
