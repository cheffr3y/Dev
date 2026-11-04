import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { launchBrowser,browserBaseUrl } from "../harness.mjs";
const db=new PrismaClient(),browser=await launchBrowser(),base=browserBaseUrl(),output="/tmp/specials-review";
await mkdir(output,{recursive:true});let page;
try{
 const item=await db.item.create({data:{name:"Special QA carrot",unit:"lb",unitCost:2,usableCosting:true,yieldFactor:.5,measurementReviewedAt:new Date()}});
 const context=await browser.newContext({viewport:{width:1440,height:1100}});page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(`${base}/login`);await page.getByLabel("Email").fill("admin@local.test");await page.getByLabel("Password").fill("local-smoke-only");await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL(`${base}/`);
 await page.goto(`${base}/specials`);await page.getByLabel("Special name",{exact:true}).fill("Tonight carrot special");
 await page.getByRole("button",{name:"Add temporary sub-recipe",exact:true}).click();
 const sub=page.getByRole("region",{name:"Temporary sub-recipe Sub-recipe 1",exact:true});
 await sub.getByLabel("Batch yield",{exact:true}).fill("2");
 await sub.getByLabel("Ingredient or recipe",{exact:true}).selectOption(`i:${item.id}`);await sub.getByLabel("Unit",{exact:true}).fill("lb");await sub.getByRole("button",{name:"Add to sub-recipe",exact:true}).click();
 const main=page.getByRole("region",{name:"Special recipe",exact:true});
 const option=await main.getByLabel("Ingredient or recipe",{exact:true}).locator("option").filter({hasText:"Sub-recipe 1 (2 qt)"}).getAttribute("value");
 await main.getByLabel("Ingredient or recipe",{exact:true}).selectOption(option);await main.getByLabel("Unit",{exact:true}).fill("qt");await main.getByRole("button",{name:"Add to dish",exact:true}).click();
 await main.getByLabel("Batch yield",{exact:true}).fill("4");await page.getByLabel("Menu price per yield unit ($)",{exact:true}).fill("10");
 assert.match(await page.locator("body").innerText(),/EP: \$4\.00 \/ lb/);
 await page.getByRole("button",{name:"Save costing",exact:true}).click();await page.waitForURL(/specials\?id=/);const id=new URL(page.url()).searchParams.get("id");
 await page.reload();assert.equal(await page.getByLabel("Special name",{exact:true}).inputValue(),"Tonight carrot special");
 assert.equal((await db.specialCosting.findUniqueOrThrow({where:{id}})).payload.nodes.length,2);
 await page.screenshot({path:`${output}/desktop.png`,fullPage:true});await page.emulateMedia({media:"print"});assert.equal(await page.getByRole("button",{name:"Save costing",exact:true}).isVisible(),false);await page.pdf({path:`${output}/special.pdf`,format:"Letter",printBackground:true});await page.emulateMedia({media:"screen"});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/mobile.png`,fullPage:true});
 assert.deepEqual(errors,[]);console.log("Nested special costing, edible yield, account save/reopen, print and mobile passed.");
}catch(error){if(page)await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}finally{await browser.close();await db.$disconnect();}
