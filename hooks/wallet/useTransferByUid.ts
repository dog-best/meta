import { supabase } from "../../services/supabase";

export async function transferByUid(toPublicUid: string, amount: number) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error("Not logged in");

  const { data: out, error } = await supabase.rpc("simple_transfer_by_public_uid", {
    p_from_user_id: userId,
    p_to_public_uid: toPublicUid,
    p_amount: amount,
  });

  if (error) throw new Error(error.message);
  return out;
}
