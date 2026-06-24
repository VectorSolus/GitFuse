import { cleanupExpiredBundles } from "./cleanup";

const result = await cleanupExpiredBundles({
  dryRun: process.argv.includes("--dry-run")
});
console.log(JSON.stringify(result));
