import { describe, expect, it } from "vitest";
import { keywordMatches } from "@/lib/match";

describe("keywordMatches", () => {
  it("is case-insensitive", () => {
    expect(keywordMatches("Why is Code Review so slow?", "code review")).toBe(true);
  });
  it("respects word boundaries", () => {
    expect(keywordMatches("Our special pipelines", "CI")).toBe(false);
    expect(keywordMatches("we use CI daily", "CI")).toBe(true);
    expect(keywordMatches("unreviewed code reviewers", "code review")).toBe(false);
    expect(keywordMatches("slow CIs everywhere", "slow CI")).toBe(false);
  });
  it("handles terms with punctuation such as CI/CD", () => {
    expect(keywordMatches("Our CI/CD pipeline is broken", "CI/CD")).toBe(true);
    expect(keywordMatches("(CI/CD)", "CI/CD")).toBe(true);
    expect(keywordMatches("CI/CDX", "CI/CD")).toBe(false);
    expect(keywordMatches("CI and CD", "CI/CD")).toBe(false);
  });
  it("matches multi-word phrases across whitespace and newlines", () => {
    expect(keywordMatches("flaky\n  tests are back", "flaky tests")).toBe(true);
    expect(keywordMatches("flaky and tests", "flaky tests")).toBe(false);
  });
  it("is safe with regex characters", () => {
    expect(keywordMatches("a (b) c", "(b)")).toBe(true);
    expect(keywordMatches("anything", ".*")).toBe(false);
  });
  it("returns false for empty input", () => {
    expect(keywordMatches("", "x")).toBe(false);
    expect(keywordMatches("x", " ")).toBe(false);
  });
});
