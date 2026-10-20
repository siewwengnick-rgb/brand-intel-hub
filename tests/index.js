// Node 22+ 把 `node --test tests/` 的目录当成模块入口跑，所以这里把各测试文件串起来。
// 单独跑也行：node --test tests/normalize.test.js tests/insights.test.js tests/store.test.js tests/router.test.js
"use strict";
require("./normalize.test.js");
require("./insights.test.js");
require("./store.test.js");
require("./router.test.js");
