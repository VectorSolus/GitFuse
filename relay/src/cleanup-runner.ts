import { cleanupExpiredBundles } from "./cleanup";

const result = await cleanupExpiredBundles();
console.log(JSON.stringify(result));
