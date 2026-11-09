const assert = require("assert");
const {
  compareGroups,
  buildGroupOrderMap,
  sortGroupRoutes,
  buildGroupOrderUpdates,
  extractGroupKey,
} = require("../src/shared/accountGroupOrder.js");

assert.strictEqual(compareGroups("b", 1, "a", 0), 1);
assert.strictEqual(compareGroups("a", null, "b", null) < 0, true);

const raw = {
  "2024-01-01": [
    { group: "group-b", phone: "group-b", groupOrder: 1, id: 2 },
    { group: "group-a", phone: "group-a", groupOrder: 0, id: 1 },
  ],
};
const map = buildGroupOrderMap(raw);
assert.strictEqual(map["group-a"], 0);
assert.strictEqual(map["group-b"], 1);

const routes = sortGroupRoutes(
  [
    { path: "/accountManager/group-b", meta: { title: "group-b", phone: "group-b" } },
    { path: "/accountManager/group-a", meta: { title: "group-a", phone: "group-a" } },
  ],
  map
);
assert.strictEqual(extractGroupKey(routes[0]), "group-a");

const updates = buildGroupOrderUpdates(raw, ["group-b", "group-a"]);
assert.deepStrictEqual(updates, [
  { id: 2, date: "2024-01-01", groupOrder: 0 },
  { id: 1, date: "2024-01-01", groupOrder: 1 },
]);

// 缺少 group 的历史记录仍按 phone 前缀分组，不改变存量账号标识。
const legacy = {
  "2024-01-02": [
    { phone: "旧组-账号甲", groupOrder: 2, id: 3 },
    { phone: "旧组-账号乙", groupOrder: 2, id: 4 },
  ],
};
assert.deepStrictEqual(buildGroupOrderMap(legacy), { 旧组: 2 });
assert.deepStrictEqual(buildGroupOrderUpdates(legacy, ["旧组"]), [
  { id: 3, date: "2024-01-02", groupOrder: 0 },
  { id: 4, date: "2024-01-02", groupOrder: 0 },
]);
assert.deepStrictEqual(legacy["2024-01-02"].map((item) => item.phone), [
  "旧组-账号甲", "旧组-账号乙",
]);

console.log("accountGroupOrder: ok");
