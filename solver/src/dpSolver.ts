export function findBestDistribution(amounts: number[][]): {
  totalAmountOut: number;
  distribution: number[];
} {
  if (!amounts[0]) {
    throw Error("no pools passed in");
  }
  const pools = amounts.length;
  const parts = amounts[0].length;

  const answers: number[][] = [];
  const parents: number[][] = [];
  for (let p = 0; p < pools; p++) {
    answers[p] = new Array(parts + 1).fill(0);
    parents[p] = new Array(parts + 1).fill(0);
  }
  for (let s = 0; s <= parts; s++) {
    answers[0][s] = amounts[0][s];
    for (let p = 1; p < pools; p++) {
      answers[p][s] = -Infinity;
    }
    parents[0][s] = 0;
  }

  for (let p = 1; p < pools; p++) {
    for (let s = 0; s <= parts; s++) {
      //Assign previous to current, assuming all distributions to previous pools is alredy the optimal solution
      answers[p][s] = answers[p - 1][s];
      //Allocate all parts S to the previous(parent)
      parents[p][s] = s;
      for (let curPart = 1; curPart <= s; curPart++) {
        // Check if allocating currentPart to current pool and the rest to previous pools
        // yields a better result than allocating all parts to previous pools(already optimize with DP algorithm)
        let preParts = s - curPart;
        if (
          amounts[p][curPart] + amounts[p - 1][preParts] >
          amounts[p - 1][s]
        ) {
          answers[p][s] = amounts[p][curPart] + amounts[p - 1][preParts];
          parents[p][s] = preParts;
        }
      }
    }
  }

  const distribution: number[] = new Array(pools).fill(0);
  // Assign first pool to answers
  answers[0] = amounts[0];
  let partsLeft = parts;
  for (let p = pools - 1; p >= 0 && partsLeft > 0; p--) {
    // parents[p][partsLeft] records the parts that should be left to previous pools(pools with smaller index)
    distribution[p] = partsLeft - parents[p][partsLeft];
    partsLeft = parents[p][partsLeft];
  }
  return { totalAmountOut: answers[pools - 1][parts], distribution };
}
