const path = require("node:path");

// Host steps import this package name. Inside an installed copy, Node will not
// execute the TypeScript under node_modules, so the test command points this
// at the copy it placed in the host project.
const entry =
  process.env.Y2K_GUESTBOOK_TESTING_ENTRY ||
  path.join(__dirname, "fixtures.ts");

module.exports = require(entry);
