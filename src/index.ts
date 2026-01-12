/**
 * Finds the best distribution of parts across multiple exchanges using dynamic programming
 * @param s - Number of parts to distribute
 * @param amounts - 2D array where amounts[i][j] represents the return from exchange i with j parts
 * @returns Object containing the maximum return amount and the optimal distribution array
 */
function findBestDistribution(
  s: number, // parts
  amounts: number[][] // exchangesReturns
): {
  returnAmount: number;
  distribution: number[];
} {
  const n = amounts.length;
  const VERY_NEGATIVE_VALUE = -1e72;

  // Initialize DP tables: answer[i][j] = best return using first i+1 exchanges with j parts
  const answer: number[][] = [];
  const parent: number[][] = [];

  // Initialize arrays
  for (let i = 0; i < n; i++) {
    answer[i] = new Array(s + 1);
    parent[i] = new Array(s + 1);
  }

  // Base case: using only the first exchange
  for (let j = 0; j <= s; j++) {
    answer[0][j] = amounts[0][j];
    for (let i = 1; i < n; i++) {
      answer[i][j] = VERY_NEGATIVE_VALUE;
    }
    parent[0][j] = 0;
  }

  // Dynamic programming: for each exchange, find best distribution
  for (let i = 1; i < n; i++) {
    for (let j = 0; j <= s; j++) {
      // Start with previous exchange's result
      answer[i][j] = answer[i - 1][j];
      parent[i][j] = j;

      // Try allocating k parts to current exchange
      for (let k = 1; k <= j; k++) {
        const candidate = answer[i - 1][j - k] + amounts[i][k];
        if (candidate > answer[i][j]) {
          answer[i][j] = candidate;
          parent[i][j] = j - k;
        }
      }
    }
  }

  // Reconstruct the optimal distribution
  const distribution: number[] = new Array(n).fill(0);
  let partsLeft = s;

  for (
    let curExchange = n - 1;
    curExchange >= 0 && partsLeft > 0;
    curExchange--
  ) {
    distribution[curExchange] = partsLeft - parent[curExchange][partsLeft];
    partsLeft = parent[curExchange][partsLeft];
  }

  const returnAmount =
    answer[n - 1][s] === VERY_NEGATIVE_VALUE ? 0 : answer[n - 1][s];

  return {
    returnAmount,
    distribution,
  };
}

// Example usage
const amounts = [
  [0, 100, 200, 300], // Exchange 0 returns
  [0, 150, 250, 350], // Exchange 1 returns
  [0, 120, 220, 320], // Exchange 2 returns
];

const result = findBestDistribution(3, amounts);
console.log("Return Amount:", result.returnAmount);
console.log("Distribution:", result.distribution);
