import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidIndianMobile,
  normalizeIndianMobile,
} from "./mobile-number.js";

test("normalizes Indian mobile numbers", () => {
  assert.equal(normalizeIndianMobile("+91 98765-43210"), "9876543210");
  assert.equal(normalizeIndianMobile("919876543210"), "9876543210");
  assert.equal(normalizeIndianMobile("9876543210"), "9876543210");
});

test("validates Indian 10-digit mobile numbers", () => {
  assert.equal(isValidIndianMobile("9876543210"), true);
  assert.equal(isValidIndianMobile("+91 9876543210"), true);
  assert.equal(isValidIndianMobile("5876543210"), false);
  assert.equal(isValidIndianMobile("987654321"), false);
  assert.equal(isValidIndianMobile("abc9876543210"), false);
});
