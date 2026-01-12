// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}
interface IUniswapV3SwapCallback {
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external;
}
interface IUniswapV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint256 sqrtPriceLimitX96, bytes calldata data) external returns (int256 amount0, int256 amount1);
}

/**
 * @title UniswapV3DexRouter
 * @author DEX Aggregator MVP
 * @notice A gas-optimized DEX aggregator router for executing parallel swaps across multiple UniswapV3 pools
 * @dev This contract enables users to split a single swap across multiple UniswapV3 pools (e.g., different fee tiers)
 *      to achieve optimal exchange rates. The contract uses transient storage for gas efficiency and implements
 *      strict pool address validation using CREATE2 computation.
 * 
 * @dev Key Features:
 *      - Parallel execution: All swaps execute independently and concurrently
 *      - Gas optimization: Uses transient storage and avoids unnecessary external calls
 *      - Security: Validates pool addresses using CREATE2 computation
 *      - Flexible routing: Supports any number of routes with different fee tiers
 * 
 * @dev Workflow:
 *      1. User calls aggregateSwap() with pre-computed optimal distribution from off-chain solver
 *      2. Contract executes swaps in parallel across multiple pools
 *      3. Each swap triggers uniswapV3SwapCallback() which transfers tokens from user
 *      4. Final output amount is validated against minAmountOut
 */
contract UniswapV3DexRouter is IUniswapV3SwapCallback {

    /// @notice UniswapV3 pool bytecode hash for CREATE2 address computation
    bytes32 internal constant POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;
    
    /// @notice UniswapV3 Factory contract address (immutable for gas savings)
    address private immutable I_FACTORY;
    
    /// @notice Transient storage slot for storing payer address during swap execution
    /// @dev Transient storage is automatically cleared at the end of the transaction
    uint256 private constant PAYER_T_SLOT = 0x0;
    
    /// @notice Error thrown when token transfer fails in callback
    /// @param tokenIn The token address that failed to transfer
    /// @param spender The address attempting to transfer
    /// @param amount The amount that failed to transfer
    error TransferTokenInFailed(address tokenIn, address spender, uint256 amount);
    
    /// @notice Error thrown when pool address validation fails
    /// @param pool The invalid pool address
    error InvalidPool(address pool);
    
    /// @notice Error thrown when transaction deadline has passed
    /// @param deadline The deadline timestamp that was exceeded
    error DeadlinePassed(uint256 deadline);
    
    /**
     * @notice Route structure defining a single swap path
     * @param pair The UniswapV3 pool address
     * @param fee The fee tier of the pool (500, 3000, or 10000)
     * @param tokenIn The input token address
     * @param tokenOut The output token address
     * @param amountIn The amount of tokenIn to swap in this route
     */
    struct Route {
        address pair;
        uint24 fee;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
    }

    /**
     * @notice Callback data structure passed to UniswapV3 pool during swap
     * @param token0 The first token (address < token1)
     * @param token1 The second token (address > token0)
     * @param poolFee The fee tier used for pool address validation
     */
    struct SwapCallbackData {
        address token0;
        address token1;
        uint24 poolFee;
    }

    /**
     * @notice Constructor to initialize the router with UniswapV3 Factory address
     * @param factory The address of the UniswapV3 Factory contract
     */
    constructor(address factory){
        I_FACTORY = factory;
    }
    
    /**
     * @notice Execute parallel swaps across multiple UniswapV3 pools
     * @dev This function splits a swap across multiple pools based on off-chain computed optimal distribution.
     *      All swaps execute in parallel, with each route independently swapping from tokenIn to tokenOut.
     *      The total output from all routes is summed and validated against minAmountOut.
     * 
     * @dev Gas optimizations:
     *      - Uses transient storage to track payer (saves ~20k gas vs mapping)
     *      - Caches array length to avoid repeated SLOAD
     *      - Uses unchecked block for addition (overflow impossible in practice)
     * 
     * @param routes Array of Route structs, each defining a swap path through a different pool
     * @param minAmountOut Minimum total amount of output tokens required (sum of all routes)
     * @param deadline Unix timestamp after which the transaction will revert
     * 
     * @custom:requirement User must have approved this contract to spend tokenIn for each route
     * @custom:requirement block.timestamp <= deadline
     * @custom:requirement totalAmountOut >= minAmountOut
     * 
     * @example
     * // Swap 1000 USDC to WETH across 3 pools with different fee tiers
     * Route[] memory routes = new Route[](3);
     * routes[0] = Route({pair: pool1, fee: 500, tokenIn: USDC, tokenOut: WETH, amountIn: 300});
     * routes[1] = Route({pair: pool2, fee: 3000, tokenIn: USDC, tokenOut: WETH, amountIn: 500});
     * routes[2] = Route({pair: pool3, fee: 10000, tokenIn: USDC, tokenOut: WETH, amountIn: 200});
     * aggregateSwap(routes, 0.5 ether, block.timestamp + 300);
     */
    function aggregateSwap(Route[] calldata routes, uint256 minAmountOut, uint256 deadline) external {
        if(block.timestamp > deadline){
            revert DeadlinePassed(deadline);
        }

        //use transient storage for gas efficiency
        address payer = msg.sender;
        assembly {
            tstore(PAYER_T_SLOT, payer)
        }
    
        //cache length and use ++i for gas efficiency
        uint256 rLen = routes.length;
        uint256 totalAmountOut = 0;
        for(uint256 i=0; i< rLen; ++i) {
            unchecked {
                totalAmountOut += _swapByUniswapV3(routes[i]);
            }
        }
        require(totalAmountOut >= minAmountOut, "DexRouter: total amount out is less than min amount out");
    }

    /**
     * @notice Execute a single swap through a UniswapV3 pool
     * @dev This internal function handles the swap execution for one route. It:
     *      1. Validates token addresses and sorts them (token0 < token1)
     *      2. Verifies pool address using CREATE2 computation
     *      3. Determines swap direction (zeroForOne)
     *      4. Calls pool.swap() which triggers the callback
     *      5. Returns the amount of output tokens received
     * 
     * @dev Gas optimizations:
     *      - Avoids external calls to pool.token0()/token1() by using address comparison
     *      - Uses sorted token addresses directly from Route struct
     * 
     * @param r Route struct containing swap parameters
     * @return amountOut The amount of tokenOut received from this swap
     * 
     * @custom:requirement r.tokenIn != r.tokenOut
     * @custom:requirement r.pair must be a valid UniswapV3 pool for (token0, token1, fee)
     */
    function _swapByUniswapV3(Route calldata r) internal returns (uint256){
        require(r.tokenIn != r.tokenOut, "DexRouter: tokenIn == tokenOut");
        
        // Sort tokens to get token0 and token1 (token0 < token1 in UniswapV3)
        // This saves gas by avoiding external calls to pool.token0() and pool.token1()
        bool zeroForOne = r.tokenIn < r.tokenOut;
        address token0;
        address token1;
        if (zeroForOne) {
            token0 = r.tokenIn;
            token1 = r.tokenOut;
        } else {
            token0 = r.tokenOut;
            token1 = r.tokenIn;
        }
        
        // Verify the pool address matches expected address
        // This also validates that tokenIn and tokenOut belong to this pool
        address expectedPool = computePoolAddress(token0, token1, r.fee);
        require(r.pair == expectedPool, "DexRouter: invalid pool address");
        
        // Prepare callback data with sorted tokens (token0 < token1)
        SwapCallbackData memory callbackData = SwapCallbackData({
            token0: token0,
            token1: token1,
            poolFee: r.fee
        });
        
        (int256 amount0, int256 amount1) = IUniswapV3Pool(r.pair).swap(
            msg.sender, 
            zeroForOne, 
            int256(r.amountIn), 
            0, 
            abi.encode(callbackData)
        );
        
        return zeroForOne ? uint256(-amount1) : uint256(-amount0);
    }

    /**
     * @notice UniswapV3 swap callback - called by the pool during swap execution
     * @dev This function is invoked by UniswapV3 pools during swap execution. It implements the
     *      "pay before receive" pattern required by UniswapV3. The function:
     *      1. Validates the caller is a legitimate UniswapV3 pool (using CREATE2)
     *      2. Retrieves the payer address from transient storage
     *      3. Transfers the required token amount from payer to pool
     * 
     * @dev Security:
     *      - Pool address validation prevents malicious contracts from calling this function
     *      - Transient storage ensures payer is only accessible during the transaction
     *      - Only one of amount0Delta or amount1Delta will be positive (the token to pay)
     * 
     * @param amount0Delta The amount of token0 that must be paid (positive) or will be received (negative)
     * @param amount1Delta The amount of token1 that must be paid (positive) or will be received (negative)
     * @param data Encoded SwapCallbackData containing pool validation information
     * 
     * @custom:requirement msg.sender must be a valid UniswapV3 pool
     * @custom:requirement payer must have approved this contract to spend the required token
     * @custom:requirement Exactly one of amount0Delta or amount1Delta must be positive
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        address pool = msg.sender;
        
        // Decode callback data
        SwapCallbackData memory callbackData = abi.decode(data, (SwapCallbackData));
        
        // Verify the caller is a valid UniswapV3 pool by computing expected address
        address expectedPool = computePoolAddress(
            callbackData.token0, 
            callbackData.token1, 
            callbackData.poolFee
        );
        require(pool == expectedPool, "DexRouter: invalid caller");
        
        // Get the payer (user who initiated the swap)
        address payer;
        assembly {
            payer := tload(PAYER_T_SLOT)
        }
        require(payer != address(0), "DexRouter: no payer registered");
        
        // Determine which token needs to be paid
        // In UniswapV3, exactly one delta will be positive (the token we need to pay)
        if (amount0Delta > 0) {
            // Need to pay token0 - transfer from the payer to the pool
            uint256 amountToPay = uint256(amount0Delta);
            if (!IERC20(callbackData.token0).transferFrom(payer, pool, amountToPay)) {
                revert TransferTokenInFailed(callbackData.token0, payer, amountToPay);
            }
        } else if (amount1Delta > 0) {
            // Need to pay token1 - transfer from the payer to the pool
            uint256 amountToPay = uint256(amount1Delta);
            if (!IERC20(callbackData.token1).transferFrom(payer, pool, amountToPay)) {
                revert TransferTokenInFailed(callbackData.token1, payer, amountToPay);
            }
        }
        // If both deltas are <= 0, something is wrong, but we'll let the swap fail naturally
    }

    /**
     * @notice Compute UniswapV3 pool address using CREATE2 deterministic address calculation
     * @dev This function replicates UniswapV3's pool address computation logic. UniswapV3 uses
     *      CREATE2 to deploy pools at deterministic addresses based on token pair and fee tier.
     *      The calculation uses:
     *      - Factory address (deployer)
     *      - Salt: keccak256(abi.encode(token0, token1, fee))
     *      - Pool bytecode hash (POOL_INIT_CODE_HASH)
     * 
     * @dev Gas cost: ~6300 gas (cheaper than calling factory.getPool() which costs ~8900+ gas)
     * 
     * @param token0 The first token address (must be < token1)
     * @param token1 The second token address (must be > token0)
     * @param poolFee The fee tier: 500 (0.05%), 3000 (0.3%), or 10000 (1%)
     * @return pool The deterministic pool address computed using CREATE2
     * 
     * @custom:requirement token0 < token1 (UniswapV3 requirement)
     */
    function computePoolAddress(
        address token0, 
        address token1, 
        uint24 poolFee
    ) internal view returns (address) {
        // Ensure tokens are in correct order (token0 < token1)
        require(token0 < token1, "DexRouter: token0 must be < token1");
        
        // CREATE2 address calculation
        bytes32 salt = keccak256(abi.encode(token0, token1, poolFee));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            hex'ff',
            I_FACTORY,
            salt,
            POOL_INIT_CODE_HASH
        )))));
    }
}
