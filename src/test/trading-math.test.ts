import { describe, expect, it } from "vitest";
import {
  calcLiquidationMove,
  calcLiquidationPrice,
  calcOpeningFee,
  calcPnl,
  PROFIT_CAP,
} from "@/lib/markets";

describe("Bluxq isolated trading math", () => {
  it.each([
    ["long", 1, 0.625],
    ["long", 10, 90.625],
    ["long", 50, 98.625],
    ["short", 1, 199.375],
    ["short", 10, 109.375],
    ["short", 50, 101.375],
  ] as const)("calculates the %s liquidation threshold at %ix", (side, leverage, expected) => {
    expect(calcLiquidationPrice(side, 100, leverage)).toBeCloseTo(expected, 8);
  });

  it("rounds the opening fee to cents after rounding margin to cents", () => {
    expect(calcOpeningFee(100)).toBe(10);
    expect(calcOpeningFee(100.05)).toBe(10.01);
    expect(calcOpeningFee(Number.NaN)).toBe(0);
  });

  it("places liquidation where the modeled loss equals the configured margin fraction", () => {
    const margin = 250;
    const leverage = 25;
    const entry = 100;
    const qty = (margin * leverage) / entry;
    const longExit = calcLiquidationPrice("long", entry, leverage);
    const shortExit = calcLiquidationPrice("short", entry, leverage);

    const expectedLoss = margin * calcLiquidationMove(leverage) * leverage;
    expect(calcPnl("long", qty, entry, longExit, margin)).toBeCloseTo(-expectedLoss, 8);
    expect(calcPnl("short", qty, entry, shortExit, margin)).toBeCloseTo(-expectedLoss, 8);
  });

  it("applies equal PnL math for long and short and caps both sides", () => {
    expect(calcPnl("long", 2, 100, 110, 100)).toBe(20);
    expect(calcPnl("short", 2, 100, 90, 100)).toBe(20);
    expect(calcPnl("long", 10, 100, 0.01, 100)).toBe(-100);
    expect(calcPnl("short", 10, 100, 1000, 100)).toBe(-100);
    expect(calcPnl("long", 10, 100, 1000, 100)).toBe(100 * PROFIT_CAP);
  });

  it("does not invent PnL when the price or position inputs are invalid", () => {
    expect(calcPnl("long", 1, 100, 0, 100)).toBe(0);
    expect(calcPnl("short", 1, 100, Number.NaN, 100)).toBe(0);
    expect(calcPnl("unknown", 1, 100, 110, 100)).toBe(0);
    expect(calcLiquidationPrice("long", 0, 10)).toBe(0);
    expect(calcLiquidationPrice("short", 100, 51)).toBe(0);
  });

  it("returns the unused margin at the exact trigger and nothing after a full-margin gap", () => {
    const margin = 100;
    const leverage = 10;
    const entry = 100;
    const qty = (margin * leverage) / entry;
    const threshold = calcLiquidationPrice("long", entry, leverage);
    const lossAtThreshold = Math.abs(calcPnl("long", qty, entry, threshold, margin));
    const lossAfterGap = Math.abs(calcPnl("long", qty, entry, 90, margin));

    expect(margin - lossAtThreshold).toBeCloseTo(6.25, 8);
    expect(Math.max(margin - lossAfterGap, 0)).toBe(0);
  });
});
