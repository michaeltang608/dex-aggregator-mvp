import Decimal from "decimal.js";

Decimal.set({ precision: 100 });
const Q128 = new Decimal(2).pow(128);
const base = new Decimal("1.0001");

// sqrt(1.0001)
const sqrtBase = base.sqrt();

// 2^128 / sqrt(1.0001)
const ratio = Q128.div(sqrtBase);

const ratioInt = ratio.floor();

// 转成 hex
const hex = "0x" + ratioInt.toHex();

// 0x0xfffcb933bd6fad37aa2d162d1a594001
console.log(hex);
