import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/services/supabase";
import { uploadToSupabaseStorage } from "@/services/market/storageUpload";

export type UserIdentity = {
  id: string;
  username: string | null;
  full_name: string | null;
  seller_profile?: {
    user_id: string;
    market_username: string | null;
    business_name: string | null;
    logo_path: string | null;
    active: boolean;
  } | null;
};

export type InboxThread = {
  id: string;
  a_user_id: string;
  b_user_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  other: UserIdentity;
  unread: boolean;
};

export type DMMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  meta: any;
  has_attachments: boolean | null;
  dm_message_attachments?: DMAttachment[];
};

export type DMAttachment = {
  id: string;
  message_id: string;
  kind: "image" | "video" | "audio" | "file";
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  mime_type: string | null;
  duration_sec: number | null;
  meta: any;
  created_at: string;
};

export async function getUserByUsername(username: string): Promise<UserIdentity | null> {
  const handle = String(username || "").trim().toLowerCase();
  if (!handle) return null;

  // Prefer seller profiles if active
  const { data: seller, error: sErr } = await supabase
    .from("market_seller_profiles")
    .select("user_id,market_username,business_name,logo_path,active")
    .eq("market_username", handle)
    .eq("active", true)
    .maybeSingle();

  if (sErr) throw new Error(sErr.message);

  if (seller?.user_id) {
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id,username,full_name")
      .eq("id", seller.user_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    return {
      id: seller.user_id,
      username: prof?.username ?? null,
      full_name: prof?.full_name ?? null,
      seller_profile: seller as any,
    };
  }

  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("id,username,full_name")
    .eq("username", handle)
    .maybeSingle();

  if (pErr) throw new Error(pErr.message);
  if (!prof?.id) return null;

  return {
    id: prof.id,
    username: prof.username ?? null,
    full_name: prof.full_name ?? null,
    seller_profile: null,
  };
}

export async function getOrCreateThread(otherUserId: string) {
  const { data, error } = await supabase.rpc("dm_get_or_create_thread", {
    p_other_user_id: otherUserId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listInboxThreads(): Promise<InboxThread[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth?.user;
  if (!me) throw new Error("Not authenticated");

  const { data: threads, error } = await supabase
    .from("dm_threads")
    .select("id,a_user_id,b_user_id,last_message_at,last_message_preview,created_at")
    .or(`a_user_id.eq.${me.id},b_user_id.eq.${me.id}`)
    .order("last_message_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (threads ?? []) as any[];
  const otherIds = Array.from(
    new Set(
      rows
        .map((t) => (t.a_user_id === me.id ? t.b_user_id : t.a_user_id))
        .filter(Boolean),
    ),
  );

  const readsMap: Record<string, string | null> = {};
  if (rows.length) {
    const { data: reads } = await supabase
      .from("dm_thread_reads")
      .select("thread_id,last_read_at")
      .eq("user_id", me.id)
      .in(
        "thread_id",
        rows.map((r) => r.id),
      );
    (reads ?? []).forEach((r: any) => {
      readsMap[r.thread_id] = r.last_read_at ?? null;
    });
  }

  const profiles =
    otherIds.length > 0
      ? (
          await supabase
            .from("profiles")
            .select("id,username,full_name")
            .in("id", otherIds)
        ).data
      : [];

  const sellers =
    otherIds.length > 0
      ? (
          await supabase
            .from("market_seller_profiles")
            .select("user_id,market_username,business_name,logo_path,active")
            .in("user_id", otherIds)
            .eq("active", true)
        ).data
      : [];

  const profileMap = new Map<string, any>();
  (profiles ?? []).forEach((p: any) => profileMap.set(p.id, p));

  const sellerMap = new Map<string, any>();
  (sellers ?? []).forEach((s: any) => sellerMap.set(s.user_id, s));

  return rows.map((t) => {
    const otherId = t.a_user_id === me.id ? t.b_user_id : t.a_user_id;
    const prof = profileMap.get(otherId);
    const seller = sellerMap.get(otherId) ?? null;
    const lastRead = readsMap[t.id] ?? null;
    const unread =
      !!t.last_message_at &&
      (!lastRead || new Date(t.last_message_at).getTime() > new Date(lastRead).getTime());

    return {
      id: t.id,
      a_user_id: t.a_user_id,
      b_user_id: t.b_user_id,
      last_message_at: t.last_message_at ?? null,
      last_message_preview: t.last_message_preview ?? null,
      created_at: t.created_at,
      other: {
        id: otherId,
        username: prof?.username ?? null,
        full_name: prof?.full_name ?? null,
        seller_profile: seller,
      },
      unread,
    };
  });
}

export async function fetchMessages(threadId: string, limit = 50) {
  const { data, error } = await supabase
    .from("dm_messages")
    .select(
      "id,thread_id,sender_id,body,created_at,meta,has_attachments,dm_message_attachments(*)",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DMMessage[];
  const hydrated = await Promise.all(
    rows.map(async (m) => {
      if (!m.dm_message_attachments?.length) return m;
      const att = await Promise.all(
        m.dm_message_attachments.map(async (a) => {
          if (a.public_url) return a;
          try {
            const { data: signed } = await supabase.storage
              .from(a.storage_bucket || "dm-media")
              .createSignedUrl(a.storage_path, 3600);
            return { ...a, public_url: signed?.signedUrl ?? null };
          } catch {
            return a;
          }
        }),
      );
      return { ...m, dm_message_attachments: att };
    }),
  );
  return hydrated;
}

export async function sendText(threadId: string, text: string) {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth?.user;
  if (!me) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("dm_messages")
    .insert({
      thread_id: threadId,
      sender_id: me.id,
      body: text.trim(),
      has_attachments: false,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data?.id as string;
}

async function inferMimeFromUri(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}

export async function sendMedia(params: {
  threadId: string;
  kind: "image" | "video" | "audio" | "file";
  uri: string;
  mime_type?: string | null;
  duration_sec?: number | null;
  body?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth?.user;
  if (!me) throw new Error("Not authenticated");

  const { threadId, kind, uri, duration_sec, body } = params;
  const mime_type = params.mime_type || (await inferMimeFromUri(uri));

  const { data: msg, error: mErr } = await supabase
    .from("dm_messages")
    .insert({
      thread_id: threadId,
      sender_id: me.id,
      body: body?.trim() || null,
      has_attachments: true,
      meta: { kind },
    })
    .select("id")
    .single();

  if (mErr) throw new Error(mErr.message);
  const messageId = msg?.id as string;

  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const ext = uri.split(".").pop() || "file";
    const path = `${threadId}/${messageId}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

    const up = await uploadToSupabaseStorage({
      bucket: "dm-media",
      path,
      localUri: uri,
      contentType: mime_type || "application/octet-stream",
      upsert: false,
    });

    const { error: aErr } = await supabase
      .from("dm_message_attachments")
      .insert({
        message_id: messageId,
        kind,
        storage_bucket: "dm-media",
        storage_path: up.storagePath,
        public_url: up.publicUrl ?? null,
        mime_type: mime_type ?? null,
        duration_sec: duration_sec ?? null,
        meta: {
          size: fileInfo?.size ?? null,
        },
      });

    if (aErr) throw new Error(aErr.message);
    return messageId;
  } catch (e) {
    await supabase.from("dm_messages").delete().eq("id", messageId);
    throw e;
  }
}

export async function markRead(threadId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth?.user;
  if (!me) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("dm_thread_reads")
    .upsert(
      { thread_id: threadId, user_id: me.id, last_read_at: new Date().toISOString() },
      { onConflict: "thread_id,user_id" },
    );

  if (error) throw new Error(error.message);
}
