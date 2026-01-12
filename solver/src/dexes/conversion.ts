import { BigNumber, ethers } from "ethers";

const MAX_DECIMALS = 4;

export function fromReadableAmount(
  amount: number,
  decimals: number
): BigNumber {
  return ethers.utils.parseUnits(amount.toString(), decimals);
}

export function toReadableAmount(rawAmount: number, decimals: number): string {
  const str = ethers.utils.formatUnits(rawAmount, decimals);
  return Number(str).toLocaleString(navigator.languages, {
    maximumFractionDigits: MAX_DECIMALS,
    minimumFractionDigits: 0,
  });
}
