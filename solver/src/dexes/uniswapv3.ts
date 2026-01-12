import { ethers } from "ethers";
import Quoter from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";
import IUniswapV3FactoryABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json";

import { ERC20_ABI } from "./abi";
import { fromReadableAmount } from "./conversion";
import { getProvider } from "./provider";
import { V3_Quoter_Address, V3_Factory_address } from "./config";
import { V3SwapInfo } from "../types";

export async function quoteParts(
  swapInfo: V3SwapInfo,
  parts: number = 10
): Promise<number[]> {
  const amountOuts: number[] = new Array(parts + 1).fill(0);
  if (!isPoolExist(swapInfo.TokenIn, swapInfo.TokenOut, swapInfo.Fee)) {
    return amountOuts;
  }
  const eachPart = swapInfo.AmountIn / parts;
  for (let i = 1; i <= parts; i++) {
    const v3SwapInfo: V3SwapInfo = { ...swapInfo, AmountIn: i * eachPart };
    const amountOut = await quote(v3SwapInfo);
    amountOuts[i] = amountOut;
  }
  return amountOuts;
}
export async function quote(swapInfo: V3SwapInfo): Promise<number> {
  const provider = getProvider();

  const quoterContract = new ethers.Contract(
    V3_Quoter_Address,
    Quoter.abi,
    provider
  );

  const tokenInContract = new ethers.Contract(
    swapInfo.TokenIn,
    ERC20_ABI,
    provider
  );

  const tokenInDecimal = await tokenInContract.decimal();

  const quotedAmountOut: number =
    await quoterContract.callStatic.quoteExactInputSingle(
      swapInfo.TokenIn,
      swapInfo.TokenOut,
      swapInfo.Fee,
      fromReadableAmount(swapInfo.AmountIn, tokenInDecimal).toString(),
      0
    );
  return quotedAmountOut;
}

export async function isPoolExist(
  tokenIn: string,
  tokenOut: string,
  fee: number
): Promise<boolean> {
  const factoryContract = new ethers.Contract(
    V3_Factory_address,
    IUniswapV3FactoryABI.abi,
    getProvider()
  );
  const poolAddress: string = await factoryContract.getPool(
    tokenIn,
    tokenOut,
    fee
  );
  if (poolAddress == ethers.constants.AddressZero) {
    return false;
  }
  return true;
}
