# Core Protocol Architecture For Perpetual Trading Dex

## Overview

This document simply described the skeleton of a minimal decentralized perpetual futures trading platform(MVP). The system consists of three core contracts: **Router**, **Margin**, and **AMM**, which work together to enable leveraged trading and liquidity provision.

## Core Components

### 1. Router Contract

- **Purpose**: User-facing interface for all interactions
- **Responsibilities**:
  - Handle user requests (LP operations and trading)
  - Transfer tokens between users and contracts
  - Route calls to appropriate contracts (AMM or Margin)

### 2. Margin Contract

- **Purpose**: Manages trader positions and collateral
- **Responsibilities**:
  - Store and manage trader margin deposits
  - Track trader positions (long/short)
  - Calculate funding fees and unrealized PnL
  - Execute position opening/closing operations

### 3. AMM Contract

- **Purpose**: Virtual AMM for price discovery and position settlement
- **Responsibilities**:
  - Maintain virtual reserves (baseReserve, quoteReserve)
  - Calculate swap prices using constant product formula
  - Update reserves based on trades
  - Sync prices with external markets via rebase mechanism

## User Roles

### LP Provider

- Provides liquidity to the protocol
- Deposits baseToken (e.g., BTC)
- Receives LP tokens as proof of liquidity provision
- Earns trading fees

### Trader

- Deposits margin (baseToken) as collateral
- Opens leveraged positions (long/short)
- Closes positions to realize profits/losses
- Withdraws remaining margin

## System Flow

### Step 1: Add Liquidity (LP Provider)

```
User (LP Provider)
    ↓
Router.addLiquidity()
    ↓
Transfer baseToken to AMM
    ↓
AMM.mint()
    ├─ Calculate quoteAmount based on current reserves
    ├─ Update baseReserve, quoteReserve (virtual)
    ├─ Mint LP tokens to user
    └─ Transfer baseToken to Margin contract
    ↓
Margin.deposit()
    └─ Update Margin reserve (real baseToken storage)
```

**Key Points**:

- AMM receives baseToken but assumes equivalent quoteToken value
- AMM updates virtual reserves (baseReserve, quoteReserve)
- Actual baseToken is transferred to Margin contract
- LP tokens represent liquidity provision
- Margin contract stores real baseToken for future settlement

**Example**:

- User deposits: 1 BTC
- AMM calculates: 1 BTC = 10,000 USDC (at current price)
- AMM updates: baseReserve += 1 BTC, quoteReserve += 10,000 USDC (virtual)
- Margin receives: 1 BTC (real)

---

### Step 2: Deposit Margin (Trader)

```
User (Trader)
    ↓
Router.deposit()
    ↓
Transfer baseToken to Margin
    ↓
Margin.addMargin()
    ├─ Update trader's baseSize (margin balance)
    └─ Update Margin reserve
```

**Key Points**:

- Trader deposits baseToken as collateral
- Margin contract tracks each trader's margin balance
- Margin reserve increases with deposits

**Example**:

- Trader deposits: 1 BTC
- Margin updates: trader.baseSize = 1 BTC
- Margin reserve: +1 BTC

---

### Step 3: Open Position (Trader)

```
User (Trader)
    ↓
Router.openPositionWithMargin()
    ↓
Margin.openPosition()
    ├─ Validate margin balance
    ├─ Check leverage limits (e.g., 2x)
    ├─ Calculate max position size
    └─ Execute swap via AMM
        ↓
    AMM.swap()
        ├─ Calculate baseAmount from quoteAmount using reserves
        ├─ Update baseReserve, quoteReserve (constant product)
        └─ Return baseAmount
    ↓
Margin updates position:
    ├─ baseSize += baseAmount (from swap)
    ├─ quoteSize -= quoteAmount (negative = long position)
    └─ tradeSize = baseAmount (entry price tracking)
```

**Key Points**:

- Trader specifies quoteAmount (position size in quoteToken)
- AMM calculates baseAmount using constant product formula
- Margin updates trader's position state
- quoteSize negative = long position, positive = short position

**Example (Long Position)**:

- Trader wants: 20,000 USDC position (long BTC)
- BTC price: 10,000 USDC/BTC
- AMM calculates: 20,000 USDC = 2 BTC
- AMM updates reserves:
  - baseReserve -= 2 BTC (virtual)
  - quoteReserve += 20,000 USDC (virtual)
- Margin updates:
  - trader.baseSize = 1 + 2 = 3 BTC
  - trader.quoteSize = -20,000 USDC (negative = long)
  - trader.tradeSize = 2 BTC (entry cost)

---

### Step 4: Price Update (External Oracle)

```
Price Oracle (Chainlink-like)
    ↓
Periodic price fetch (e.g., every 15 minutes)
    ↓
AMM.rebase()
    ├─ Compare internal price vs external price
    ├─ If deviation > threshold (e.g., 3%)
    └─ Update quoteReserve to match external price
        (baseReserve unchanged - real tokens)
```

**Key Points**:

- External oracle provides market price
- Rebase mechanism syncs AMM price with market
- Only quoteReserve is updated (virtual)
- baseReserve remains unchanged (real LP deposits)

**Example**:

- Initial: baseReserve = 100 BTC, quoteReserve = 1,000,000 USDC
- External price: BTC = 11,000 USDC (10% increase)
- Rebase updates: quoteReserve = 1,100,000 USDC
- baseReserve: unchanged (still 100 BTC real)

---

### Step 5: Close Position (Trader)

```
User (Trader)
    ↓
Router.closePosition()
    ↓
Margin.closePosition()
    ├─ Calculate baseAmount needed to repay quoteAmount
    └─ Execute reverse swap via AMM
        ↓
    AMM.swap()
        ├─ Calculate baseAmount from quoteAmount using current reserves
        ├─ Update baseReserve, quoteReserve
        └─ Return baseAmount
    ↓
Margin updates position:
    ├─ baseSize -= baseAmount (repay borrowed BTC)
    ├─ quoteSize += quoteAmount (reduce position)
    └─ Calculate profit/loss
    ↓
User withdraws remaining margin
```

**Key Points**:

- Trader closes position by repaying quoteAmount
- AMM calculates baseAmount needed at current price
- If price increased, less baseAmount needed = profit
- Profit is reflected in increased baseSize

**Example (Long Position Close)**:

- Position: quoteSize = -20,000 USDC (long)
- Current price: BTC = 11,000 USDC (after rebase)
- AMM calculates: 20,000 USDC = 1.818 BTC (at new price)
- AMM updates reserves:
  - baseReserve += 1.818 BTC (virtual)
  - quoteReserve -= 20,000 USDC (virtual)
- Margin updates:
  - trader.baseSize = 3 - 1.818 = 1.182 BTC
  - trader.quoteSize = -20,000 + 20,000 = 0 (position closed)
- Profit: 1.182 - 1 (initial margin) = 0.182 BTC

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         User Layer                          │
├──────────────────────┬──────────────────────────────────────┤
│   LP Provider        │          Trader                      │
└──────────┬───────────┴────────────┬─────────────────────────┘
           │                        │
           │                        │
    ┌──────▼──────────┐    ┌───────▼──────────┐
    │                 │    │                  │
    │     Router      │    │     Router       │
    │                 │    │                  │
    └──────┬──────────┘    └───────┬──────────┘
           │                       │
           │                       │
    ┌──────▼──────────┐    ┌───────▼──────────┐
    │                 │    │                  │
    │      AMM        │    │     Margin       │
    │                 │    │                  │
    │ Virtual Reserves│    │ Real baseToken   │
    │ baseReserve     │    │ Reserve          │
    │ quoteReserve    │    │ Trader Positions │
    │                 │    │                  │
    └──────┬──────────┘    └───────┬──────────┘
           │                       │
           │                       │
           └───────────┬───────────┘
                       │
                       │
              ┌────────▼────────┐
              │                 │
              │  Price Oracle   │
              │  (External)      │
              │                 │
              └─────────────────┘
```

## Key Design Principles

### 1. Virtual AMM

- AMM maintains virtual reserves for price calculation
- Only baseToken flows through the system
- quoteToken is used only for pricing, not actual transfers

### 2. Real vs Virtual Assets

- **Real**: baseToken stored in Margin contract (for settlement)
- **Virtual**: quoteReserve in AMM (for price calculation only)
- baseReserve in AMM represents real LP deposits

### 3. Price Synchronization

- Rebase mechanism keeps AMM price aligned with external markets
- Only quoteReserve is updated during rebase
- baseReserve remains constant (real tokens)

### 4. Position Tracking

- **baseSize**: Trader's margin + position value (in baseToken)
- **quoteSize**: Position size (negative = long, positive = short)
- **tradeSize**: Entry cost tracking for PnL calculation

### 5. Profit/Loss Settlement

- All profits/losses settled in baseToken
- Profit increases baseSize
- Loss decreases baseSize
- Users withdraw remaining baseSize as margin

## Security Considerations

1. **Access Control**: Only Router can call Margin/AMM functions
2. **Reentrancy Protection**: All state-changing functions use nonReentrant modifier
3. **Price Manipulation**: Rebase mechanism prevents large price deviations
4. **Liquidation**: Under-collateralized positions can be liquidated
5. **Slippage Protection**: Trading slippage limits prevent excessive price impact

## Gas Optimization

1. **Storage Packing**: baseReserve, quoteReserve, blockTimestamp packed in single slot
2. **Local Variables**: Caching storage reads to reduce SLOAD operations
3. **Batch Operations**: OrderBook supports batch execution for limit orders

## Future Improvements

1. **Price Consistency**: Consider using mark price for closing positions (similar to liquidation)
2. **Rebase Automation**: Implement automated rebase triggers
3. **Liquidity Incentives**: Additional rewards for LP providers
4. **Cross-Margin**: Support for cross-collateral margin trading
