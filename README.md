# DEX Aggregator MVP

A gas-optimized DEX aggregator that leverages 1inch-inspired dynamic programming algorithms to find optimal token distribution across multiple UniswapV3 pools with different fee tiers. This project implements an off-chain solver for calculating optimal allocation and an on-chain router contract for atomic execution.

## 🎯 Overview

This project addresses the challenge of finding the best exchange rate when swapping tokens across multiple UniswapV3 pools. Instead of executing a single swap in one pool, the aggregator splits the swap across multiple pools (different fee tiers: 0.05%, 0.3%, and 1%) to achieve optimal rates.

### Key Features

- **Off-chain Optimization**: Uses dynamic programming (DP) algorithm inspired by 1inch to calculate optimal distribution
- **Multi-Pool Aggregation**: Splits swaps across UniswapV3 pools with different fee tiers (500, 3000, 10000)
- **Gas Optimized**: Implements transient storage and avoids unnecessary external calls
- **Atomic Execution**: All swaps execute atomically in a single transaction
- **Secure**: Validates pool addresses using CREATE2 computation

## 🏗️ Architecture

The project follows a two-layer architecture:

```
┌─────────────────────────────┐
│   Off-chain Solver          │
│   (TypeScript)               │
│   - Quote from pools         │
│   - DP algorithm             │
│   - Optimal distribution     │
└──────────────┬───────────────┘
               │ Routes + Distribution
               ▼
┌─────────────────────────────┐
│   On-chain Router           │
│   (Solidity)                 │
│   - Parallel swaps           │
│   - Atomic execution         │
│   - Callback handling        │
└─────────────────────────────┘
```

### Workflow

1. **Off-chain Calculation**:

   - Split input amount into parts (default: 10)
   - Query quotes from three different fee-tier pools for each part
   - Use dynamic programming to find optimal distribution
   - Generate route array with optimal allocation

2. **On-chain Execution**:
   - User approves router contract to spend input tokens
   - Router executes parallel swaps across multiple pools
   - Each pool calls back to router for token payment
   - Final output validated against minimum amount

## 🚀 Usage

### Basic Example

```typescript
import { Wallet } from "ethers";
import { aggregateTrade } from "./solver/src/aggregator";

// Initialize signer
const signer = new Wallet(privateKey, provider);

// Define swap parameters
const swapInfo = {
  TokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  TokenOut: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  AmountIn: 1000, // 1000 USDC
  MinAmountOut: 0.5, // Minimum 0.5 WETH
  Deadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
};

// Execute aggregated trade
const result = await aggregateTrade(
  swapInfo,
  routerContractAddress, // Deployed UniswapV3DexRouter address
  signer
);

console.log("Transaction hash:", result.receipt.transactionHash);
console.log("Total amount out:", result.totalAmountOut);
console.log("Distribution:", result.distribution);
```

### Solver Usage

```typescript
import { aggregateTrade } from "./solver/src/aggregator";
import { SwapInfo } from "./solver/src/types";

const swapInfo: SwapInfo = {
  TokenIn: "0x...",
  TokenOut: "0x...",
  AmountIn: 1000,
  MinAmountOut: 0.5,
  Deadline: Math.floor(Date.now() / 1000) + 300,
};

// The function will:
// 1. Query quotes from LOW, MEDIUM, HIGH fee pools
// 2. Calculate optimal distribution using DP
// 3. Build routes array
// 4. Approve tokens (if needed)
// 5. Execute aggregateSwap on contract
const result = await aggregateTrade(swapInfo, routerAddress, signer);
```

## 📁 Project Structure

```
dex-aggregagor-mvp/
├── contracts/
│   └── UniswapV3DexRouter.sol    # On-chain router contract
├── solver/
│   ├── src/
│   │   ├── aggregator.ts         # Main aggregation logic
│   │   ├── dpSolver.ts           # Dynamic programming solver
│   │   ├── types.ts              # TypeScript interfaces
│   │   └── dexes/
│   │       ├── uniswapv3.ts      # UniswapV3 integration
│   │       ├── config.ts         # Configuration
│   │       └── ...
│   └── tests/                    # Solver tests
├── test/
│   └── uniswap.t.ts              # Contract tests
├── scripts/                      # Deployment scripts
└── docs/                         # Documentation
```

## 🔬 Algorithm: Dynamic Programming Solver

The solver uses a dynamic programming approach inspired by 1inch's aggregation algorithm:

1. **Input Splitting**: Divides the input amount into N parts (default: 10)
2. **Quote Collection**: For each part, queries output amounts from all fee-tier pools
3. **DP Optimization**: Uses DP to find the optimal distribution that maximizes total output
4. **Route Generation**: Converts distribution into route array for on-chain execution

### DP Algorithm Complexity

- **Time Complexity**: O(P × S²) where P = number of pools, S = number of parts
- **Space Complexity**: O(P × S)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test test/uniswap.t.ts
```

## 🔧 Configuration

Update `solver/src/dexes/config.ts` with your network settings:

```typescript
export const Mainnet_RPC = "https://eth.llamarpc.com";
export const V3_Factory_address = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
export const V3_Quoter_Address = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
```

## 🛡️ Security Features

- **Pool Address Validation**: Uses CREATE2 computation to verify pool addresses
- **Transient Storage**: Uses EIP-1153 transient storage for gas-efficient payer tracking
- **Deadline Protection**: Prevents execution of stale transactions
- **Minimum Output Validation**: Ensures swap meets user's expectations

## ⛽ Gas Optimizations

- **Transient Storage**: Saves ~20k gas compared to using storage mappings
- **Address Comparison**: Avoids external calls to `pool.token0()`/`token1()` (~4.2k gas saved)
- **CREATE2 Computation**: Cheaper than calling `factory.getPool()` (~2.6k gas saved)
- **Unchecked Arithmetic**: Safe overflow checks removed where appropriate

## 📚 Technical Stack

- **Solidity**: ^0.8.24 (with transient storage support)
- **TypeScript**: ^5.9.3
- **Ethers.js**: ^5.7.2
- **Uniswap V3 SDK**: ^3.9.0
- **Vitest**: ^4.0.16 (for testing)

## 🔄 How It Works

### Off-chain Solver Flow

```
1. Split AmountIn → [part1, part2, ..., part10]
2. For each part, query quotes from:
   - Pool with 0.05% fee (LOW)
   - Pool with 0.3% fee (MEDIUM)
   - Pool with 1% fee (HIGH)
3. Build amounts matrix: amounts[pool][part] = output
4. Run DP algorithm to find optimal distribution
5. Generate routes array with optimal allocation
```

### On-chain Execution Flow

```
1. User calls aggregateSwap(routes, minAmountOut, deadline)
2. Contract stores payer in transient storage
3. For each route:
   a. Validate pool address (CREATE2)
   b. Call pool.swap()
   c. Pool calls uniswapV3SwapCallback()
   d. Router transfers tokens from payer to pool
4. Sum all outputs
5. Validate totalAmountOut >= minAmountOut
```

## 📝 Example: Swapping 1000 USDC to WETH

```
Input: 1000 USDC

Optimal Distribution (calculated off-chain):
- Route 1: 300 USDC → Pool1 (0.05% fee) → 0.15 WETH
- Route 2: 500 USDC → Pool2 (0.3% fee) → 0.25 WETH
- Route 3: 200 USDC → Pool3 (1% fee) → 0.10 WETH

Total Output: 0.50 WETH
(May be better than swapping all 1000 USDC in a single pool)
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

ISC

## 🙏 Acknowledgments

- Inspired by [1inch](https://1inch.io/) aggregation algorithm
- Built on [Uniswap V3](https://uniswap.org/)

## ⚠️ Disclaimer

This is an MVP (Minimum Viable Product) for research and educational purposes. Use at your own risk. Always audit smart contracts before deploying to mainnet.
