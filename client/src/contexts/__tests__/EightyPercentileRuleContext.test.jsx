import {
  EightyPercentileRuleProvider,
  useEightyPercentile,
} from "../EightyPercentileRuleContext";
import { NumwitRuleProvider, useNumwit } from "../NumwitRuleContext";

describe("EightyPercentileRuleContext (backwards-compat re-export)", () => {
  test("re-exports NumwitRuleProvider as EightyPercentileRuleProvider", () => {
    expect(EightyPercentileRuleProvider).toBe(NumwitRuleProvider);
  });

  test("re-exports useNumwit as useEightyPercentile", () => {
    expect(useEightyPercentile).toBe(useNumwit);
  });
});
