import { callFn } from "../../services/functions";

export async function withdrawToBank(input: {
  amount: number;
  bank_code: string;
  account_number: string;
  account_name: string;
}) {
  return await callFn("paystack-withdraw-init", input);
}
