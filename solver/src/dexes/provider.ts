import { ethers } from "ethers";
import { Mainnet_RPC } from "./config";

var provider: ethers.providers.JsonRpcProvider;
export function getProvider(): ethers.providers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(Mainnet_RPC);
  }
  return provider;
}
