// split amountIn in ten parts and get quote among three fee-type pools
// calculate optimal distribution among 3 parts
import { ethers } from "ethers";
import { SwapInfo, V3SwapInfo } from "./types";
import { quoteParts } from "./dexes/uniswapv3";
import { FeeAmount } from "@uniswap/v3-sdk";
import { findBestDistribution } from "./dpSolver";
import { getProvider } from "./dexes/provider";
import { V3_Factory_address } from "./dexes/config";
import { fromReadableAmount } from "./dexes/conversion";
import { ERC20_ABI } from "./dexes/abi";
import IUniswapV3FactoryABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json";

/**
 * Route interface matching the Solidity struct
 */
interface Route {
  pair: string;
  fee: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string; // BigNumber string
}

/**
 * Get pool address for a given token pair and fee tier using factory.getPool()
 * @param tokenIn Input token address
 * @param tokenOut Output token address
 * @param fee Fee tier (500, 3000, or 10000)
 * @returns Pool address or zero address if pool doesn't exist
 */
async function getPoolAddress(
  tokenIn: string,
  tokenOut: string,
  fee: number
): Promise<string> {
  const provider = getProvider();
  const factoryContract = new ethers.Contract(
    V3_Factory_address,
    IUniswapV3FactoryABI.abi,
    provider
  );

  const poolAddress: string = await factoryContract.getPool(
    tokenIn,
    tokenOut,
    fee
  );

  if (poolAddress === ethers.constants.AddressZero) {
    throw new Error(
      `Pool does not exist for tokens ${tokenIn}/${tokenOut} with fee ${fee}`
    );
  }

  return poolAddress;
}

/**
 * Aggregate trade function that calculates optimal distribution and executes swaps
 * @param swapInfo Swap information including tokens, amounts, and deadline
 * @param routerAddress The deployed UniswapV3DexRouter contract address
 * @param signer The signer (wallet) to execute the transaction
 * @returns Transaction receipt
 */
export async function aggregateTrade(
  swapInfo: SwapInfo,
  routerAddress: string,
  signer: ethers.Signer
) {
  // Step 1: Calculate corresponding outputs of different distributions through three different fee-tier pools
  const v3SwapInfoLowFee: V3SwapInfo = {
    Fee: FeeAmount.LOW,
    ...swapInfo,
  };
  const amountsOutForLowFeePool = await quoteParts(v3SwapInfoLowFee);

  const v3SwapInfoMediumFee: V3SwapInfo = {
    Fee: FeeAmount.MEDIUM,
    ...swapInfo,
  };
  const amountsOutForMediumFeePool = await quoteParts(v3SwapInfoMediumFee);

  const v3SwapInfoHighFee: V3SwapInfo = {
    Fee: FeeAmount.HIGH,
    ...swapInfo,
  };
  const amountsOutForHighFeePool = await quoteParts(v3SwapInfoHighFee);

  const amounts: number[][] = [
    amountsOutForLowFeePool,
    amountsOutForMediumFeePool,
    amountsOutForHighFeePool,
  ];

  // Step 2: Get optimized distribution through off-chain DP algorithm
  const { totalAmountOut, distribution } = findBestDistribution(amounts);

  // Step 3: Build routes array from distribution
  const parts = 10; // Number of parts used in quoteParts
  const eachPart = swapInfo.AmountIn / parts;

  // Get token decimals for amount conversion
  const provider = getProvider();
  const tokenInContract = new ethers.Contract(
    swapInfo.TokenIn,
    ERC20_ABI,
    provider
  );
  const tokenOutContract = new ethers.Contract(
    swapInfo.TokenOut,
    ERC20_ABI,
    provider
  );
  const tokenInDecimals = await tokenInContract.decimals();
  const tokenOutDecimals = await tokenOutContract.decimals();

  const routes: Route[] = [];
  const fees = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];

  for (let i = 0; i < distribution.length; i++) {
    if (distribution[i] > 0) {
      const amountIn = distribution[i] * eachPart;
      const poolAddress = await getPoolAddress(
        swapInfo.TokenIn,
        swapInfo.TokenOut,
        fees[i]
      );

      routes.push({
        pair: poolAddress,
        fee: fees[i],
        tokenIn: swapInfo.TokenIn,
        tokenOut: swapInfo.TokenOut,
        amountIn: fromReadableAmount(amountIn, tokenInDecimals).toString(),
      });
    }
  }

  if (routes.length === 0) {
    throw new Error("No valid routes found");
  }

  // Step 4: Approve router to spend tokenIn (if not already approved)
  const tokenInAmount = fromReadableAmount(swapInfo.AmountIn, tokenInDecimals);
  const tokenInWithSigner = tokenInContract.connect(signer);
  const currentAllowance = await tokenInContract.allowance(
    await signer.getAddress(),
    routerAddress
  );

  if (currentAllowance.lt(tokenInAmount)) {
    const approveTx = await tokenInWithSigner.approve(
      routerAddress,
      ethers.constants.MaxUint256
    );
    await approveTx.wait();
  }

  // Step 5: Execute aggregateSwap on the contract
  const routerABI = [
    "function aggregateSwap(tuple(address pair, uint24 fee, address tokenIn, address tokenOut, uint256 amountIn)[] routes, uint256 minAmountOut, uint256 deadline) external",
  ];

  const routerContract = new ethers.Contract(routerAddress, routerABI, signer);

  // Convert minAmountOut to wei using tokenOut decimals
  const minAmountOut = fromReadableAmount(
    swapInfo.MinAmountOut,
    tokenOutDecimals
  );

  const tx = await routerContract.aggregateSwap(
    routes,
    minAmountOut,
    swapInfo.Deadline
  );

  const receipt = await tx.wait();

  return {
    receipt,
    totalAmountOut,
    distribution,
    routes,
  };
}
