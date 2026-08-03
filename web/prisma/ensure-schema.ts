import { ensureQuoteSchemaColumns } from "../src/lib/ensure-schema";

ensureQuoteSchemaColumns()
  .then(() => {
    console.log("ensure-schema: ok");
    process.exit(0);
  })
  .catch((e) => {
    console.error("ensure-schema: failed", e);
    process.exit(1);
  });
