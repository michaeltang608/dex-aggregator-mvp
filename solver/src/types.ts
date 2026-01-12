export interface SwapInfo {
  TokenIn: string;
  TokenOut: string;
  AmountIn: number;
  MinAmountOut: number;
  Deadline: number;
}

export interface V3SwapInfo extends SwapInfo {
  Fee: number;
}
