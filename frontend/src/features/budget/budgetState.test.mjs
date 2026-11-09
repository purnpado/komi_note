import assert from "node:assert/strict";
import test from "node:test";
import { entryProblem, filterEntries, monthOptions, parseAmount, printHtml, summarize, totals, won } from "./budgetState.ts";

const ledger = { id: "L", name: "학급 운영비", schoolYear: "2026", planned: 500000, categories: ["간식", "물품", "기타"] };
const e = (over) => ({ id: over.title, ledgerId: "L", date: "2026-11-09", type: "지출", category: "간식", title: "x", amount: 1000, payment: "카드", receipts: [], ...over });
const entries = [
  e({ title: "간식", amount: 30000 }),
  e({ title: "청소 물품", category: "물품", amount: 20000, date: "2026-10-02", receipts: [{ id: "r" }] }),
  e({ title: "학부모회 지원", type: "수입", amount: 50000, date: "2026-10-15", category: "기타" }),
  e({ title: "다른 장부", ledgerId: "M", amount: 999 }),
];

test("합계·집행률·항목별", () => {
  const s = summarize(ledger, entries);
  assert.equal(s.expense, 50000);
  assert.equal(s.income, 50000);
  assert.equal(s.remaining, 500000);
  assert.equal(s.usedPercent, 9);
  assert.deepEqual(s.categories.map((c) => [c.category, c.amount, c.percent]), [["간식", 30000, 60], ["물품", 20000, 40]]);
  assert.equal(won(1234567), "1,234,567원");
});

test("거르기·달 목록·소계", () => {
  assert.equal(filterEntries(entries, "L", { type: "지출", category: "", month: "", query: "" }).length, 2);
  assert.deepEqual(filterEntries(entries, "L", { type: "", category: "", month: "2026-10", query: "" }).map((x) => x.title), ["청소 물품", "학부모회 지원"]);
  assert.deepEqual(filterEntries(entries, "L", { type: "", category: "", month: "", query: "청소" }).map((x) => x.title), ["청소 물품"]);
  assert.deepEqual(monthOptions(entries, "L"), ["2026-11", "2026-10"]);
  assert.deepEqual(totals(entries.slice(0, 3)), { income: 50000, expense: 50000 });
});

test("금액 입력·검사·인쇄", () => {
  assert.equal(parseAmount("12,000원"), 12000);
  assert.equal(parseAmount(""), 0);
  assert.equal(entryProblem(e({ title: " " })), "내용을 입력해 주세요.");
  assert.equal(entryProblem(e({ amount: 0 })), "금액을 1원 이상 입력해 주세요.");
  assert.equal(entryProblem(e({})), "");
  const html = printHtml(ledger, [e({ title: "<간식>" })], "전체");
  assert.ok(html.includes("&lt;간식&gt;") && html.includes("암호화되지 않습니다") && html.includes("남은 금액"));
});
