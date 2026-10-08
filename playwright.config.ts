import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir:"./tests/browser", fullyParallel:false, timeout:90000,
 expect:{timeout:15000},
 use:{baseURL:"http://127.0.0.1:4173",viewport:{width:1440,height:1100},headless:true,screenshot:"only-on-failure"},
 webServer:{command:"npm run preview -- --port 4173",url:"http://127.0.0.1:4173",reuseExistingServer:true},
 reporter:"list"
});
