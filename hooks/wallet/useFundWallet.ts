import { callFn } from "../../services/functions";

export async function initDeposit(amount: number) {
  // your existing edge function name is paystack-init
  return await callFn<{ success: true; authorization_url: string; reference: string }>("paystack-init", { amount });
}
