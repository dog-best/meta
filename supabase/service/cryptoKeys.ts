import { ethers } from "ethers";

export function orderKeyKeccak(orderId: string) {
  return ethers.keccak256(ethers.toUtf8Bytes(orderId));
}
