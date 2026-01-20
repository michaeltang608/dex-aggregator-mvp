There's definitely a gap between the mathematical modeling and the actual engineering implementation in UniswapV3. Below is my understanding and derivation process of the price conversion logic.

---

# UniswapV3 Tick to sqrtPriceX96 Conversion (Engineering Implementation)

## Mathematical Model

### Basic Formula

Let:

- $b = 1.0001$ (base multiplier per tick)
- $t$ = tick value
- $p$ = price
- $r$ = sqrtPriceX96

The price can be expressed as:

$$
p = b^t
$$

The sqrtPriceX96 is:

$$
r = \sqrt{p} \times 2^{96} = \sqrt{b^t} \times 2^{96}
$$

## Engineering Implementation Approach

### Step 1: Binary Decomposition

Decompose the tick into binary powers:

$$
t = 2^0 + 2^1 + 2^2 + \cdots = \sum_{i=0}^{n} 2^i \cdot t_i
$$

where $t_i \in \{0, 1\}$ represents the $i$-th bit of $t$.

Then the price can be written as:

$$
p = b^t = b^{(2^0 \cdot t_0 + 2^1 \cdot t_1 + 2^2 \cdot t_2 + \cdots)} = b^{2^0 \cdot t_0} \times b^{2^1 \cdot t_1} \times b^{2^2 \cdot t_2} \times \cdots
$$

Or equivalently:

$$
p = (b^{2^0})^{t_0} \times (b^{2^1})^{t_1} \times (b^{2^2})^{t_2} \times \cdots
$$

### Step 2: Negative Tick Transformation

For negative ticks, we use the inverse relationship:

$$
p = b^t = \frac{1}{b^{-t}} = \frac{1}{(b^{-1})^t}
$$

Let $c = b^{-1} = \frac{1}{b}$, then:

$$
p = \frac{1}{c^t}
$$

### Step 3: Calculate ratio2 for Negative Tick

For negative tick $-t$, we calculate $r_2$ (ratio2):

$$
r_2 = \sqrt{c^t} = \sqrt{c^{(2^0 \cdot t_0 + 2^1 \cdot t_1 + 2^2 \cdot t_2 + \cdots)}}
$$

Using binary decomposition:

$$
r_2 = \sqrt{c^{2^0 \cdot t_0} \times c^{2^1 \cdot t_1} \times c^{2^2 \cdot t_2} \times \cdots}
$$

Since square root is multiplicative:

$$
r_2 = \sqrt{c^{2^0 \cdot t_0}} \times \sqrt{c^{2^1 \cdot t_1}} \times \sqrt{c^{2^2 \cdot t_2}} \times \cdots
$$

Which simplifies to:

$$
r_2 = (c^{2^0})^{t_0/2} \times (c^{2^1})^{t_1/2} \times (c^{2^2})^{t_2/2} \times \cdots
$$

### Step 4: Introduce d = sqrt(c)

Let $d = \sqrt{c} = \sqrt{b^{-1}} = \frac{1}{\sqrt{b}}$, then:

$$
r_2 = d^{2^0 \cdot t_0} \times d^{2^1 \cdot t_1} \times d^{2^2 \cdot t_2} \times \cdots
$$

Or:

$$
r_2 = (d^{2^0})^{t_0} \times (d^{2^1})^{t_1} \times (d^{2^2})^{t_2} \times \cdots
$$

### Step 5: Q128.128 Fixed-Point Representation

To maintain precision, we use Q128.128 fixed-point format:

$$
d \times 2^{128} = \frac{2^{128}}{\sqrt{b}} = \frac{2^{128}}{\sqrt{1.0001}}
$$

The precomputed constant value is:

$$
d \times 2^{128} = \text{0x0fffcb933bd6fad37aa2d162d1a594001}
$$

### Step 6: Final Conversion

After computing $r_2$ using the iterative multiplication of precomputed values $d^{2^i}$, we get the final sqrtPriceX96:

$$
r = \frac{2^{96}}{r_2} = \frac{\text{uint256}}{r_2}
$$

## Implementation Summary

1. **Decompose tick**: $t = \sum_{i=0}^{n} 2^i \cdot t_i$
2. **Precompute constants**: $d^{2^i} \times 2^{128}$ for $i = 0, 1, 2, \ldots$
3. **Iterative multiplication**: $r_2 = \prod_{i: t_i = 1} (d^{2^i} \times 2^{128})$
4. **Final result**: $r = \frac{2^{96}}{r_2} = \frac{\text{uint256}}{r_2}$

This approach avoids expensive exponentiation operations by using precomputed values and bit manipulation.
