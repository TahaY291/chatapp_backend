
import { getCacheKey, queryCache } from './utils/rag';

test("sanity check — jest is working", () => {
  expect(1 + 1).toBe(2);
});

describe("queryCache (get/set cycle)", () => {
  beforeEach(() => {
    queryCache.clear();
  })
})