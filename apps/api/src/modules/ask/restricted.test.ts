import { describe, expect, it } from "vitest";
import { isRestrictedTopic } from "./restricted.js";

describe("Pay and performance pre-check", () => {
  it.each([
    "What is my salary band?",
    "What is Sam paid?",
    "what's Sam paid",
    "How much does Sam earn?",
    "how much does Sam Lee earn a year",
    "How much is Priya paid?",
    "How much are we paid?",
    "How much do PMs get paid?",
    "What are engineers paid here?",
    "What does Sam earn?",
    "What's Priya earning these days?",
    "What does the CTO make a year?",
    "What is Sam's pay?",
    "Is Sam paid more than Priya?",
    "Who earns more than the team lead?",
    "Can I see Sam's payslip?",
    "What's the hourly wage for interns?",
    "Did Priya get a bonus?",
  ])("refuses %j", (question) => {
    expect(isRestrictedTopic(question)).toBe(true);
  });

  it.each([
    "Do we have a paid plan?",
    "What is the paid plan?",
    "How much is the paid tier?",
    "What does the paid plan include?",
    "What's the paid version called?",
    "What is paid time off?",
    "What is the paid time off policy?",
    "Is parental leave paid?",
    "How do I upgrade to a paid account?",
    "Has the vendor invoice been paid?",
    "How much paid media did we run last month?",
    "What did we earn last quarter?",
    "How much does the product earn per customer?",
    "What does the billing service do?",
    "How much does the Pro plan cost?",
    "Which payment provider do we use?",
    "Where is the customer's pay page?",
    "Who should pay for the conference tickets?",
  ])("answers %j", (question) => {
    expect(isRestrictedTopic(question)).toBe(false);
  });
});
