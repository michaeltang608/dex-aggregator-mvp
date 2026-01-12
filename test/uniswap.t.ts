import { describe, test, expect } from "vitest";
import { isContractExist } from "../solver/src/dexes/utils";
import { V3_Quoter_Address } from "../solver/src/dexes/config";
import { isPoolExist } from "../solver/src/dexes/uniswapv3";
import { FeeAmount, computePoolAddress } from "@uniswap/v3-sdk";

describe("UniswapV3", () => {
  test("should check if contract exists on mainnet", async () => {
    // UniswapV3 Quoter contract address on Ethereum mainnet
    const emptyAddress = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB1";
    expect(await isContractExist(emptyAddress)).toBe(false);
    expect(await isContractExist(V3_Quoter_Address)).toBe(true);
  }),
    test("check pool exists", async () => {
      const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
      const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
      const SHIB = "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE";
      expect(await isPoolExist(SHIB, USDT, FeeAmount.LOW)).toBe(true);
      expect(await isPoolExist(SHIB, USDT, FeeAmount.MEDIUM)).toBe(true);
      expect(await isPoolExist(SHIB, USDT, FeeAmount.HIGH)).toBe(true);
    });
});
