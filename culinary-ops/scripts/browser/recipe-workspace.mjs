// Frontend-only recipe editor regression: bundles the real page with in-memory
// read fixtures and mutation spies. Never connects to a database. See
// docs/recipe-editor.md for browser configuration and coverage.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const project = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(`${project}/package.json`);
const { build } = require('esbuild');
const { compile } = require('tailwindcss');
const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.RECIPE_REVIEW_DIR || '/tmp/recipe-workspace-review';
await mkdir(output, { recursive: true });
const fixture = `
const now = new Date();
const raw = {id:'oil',name:'Olive Oil',unit:'fl oz',unitCost:0.25,allergens:'soy',priceUpdatedAt:new Date('2020-01-01'),category:'Oil',measurementReviewedAt:null,vendor:{name:'Test supplier'},sku:'OLV',gcode:'OIL'};
const egg = {id:'egg',name:'Egg Yolk',unit:'each',unitCost:0.5,allergens:'eggs',priceUpdatedAt:now,category:'Dairy',measurementReviewedAt:null,vendor:{name:'Test supplier'},sku:'EGG',gcode:'EGG'};
const salt = {id:'salt',name:'Kosher Salt',unit:'oz',unitCost:0.2,allergens:null,priceUpdatedAt:now,category:'Spices',measurementReviewedAt:null,vendor:{name:'Test supplier'},sku:'SALT',gcode:'SLT'};
const child = {id:'base',name:'Dressing Base',prodCode:'DAB',category:'Dressing/Vinaigrette',yieldQty:16,yieldUnit:'fl oz',allergens:null,items:[{quantity:2,unit:'each',item:egg}],components:[]};
const recipe = {id:'recipe',name:'Caesar Dressing, Anchovy free',prodCode:'CAY',version:1,category:'Dressing/Vinaigrette',station:'Commissary',yieldQty:128,yieldUnit:'fl oz',menuPrice:1.2,allergens:'mustard',instructions:'EMULSIFY — Slowly stream in oil.\\nSEASON — Adjust seasoning.',prepMinutes:15,cookMinutes:0,productionPersonMinutes:20,shelfLife:'3 days refrigerated',holdLifeDays:3,criticalNotes:'Keep chilled.',storage:'Covered and labeled.',items:[{id:'line-oil',itemId:'oil',quantity:32,unit:'fl oz',note:'stream slowly',groupName:'Emulsion',sortOrder:0,item:raw}],components:[{id:'link-base',childId:'base',quantity:16,unit:'fl oz',note:'chilled',child}],changes:[{id:'change',summary:'Recipe created',detail:'Production code: CAY',version:1,userName:'Test chef',createdAt:now}]};
export const prisma = { recipe: {findUnique:async()=>recipe,findMany:async()=>[recipe,child]},item:{findMany:async()=>[raw,egg,salt]} };
`;
const stubs = {
  prisma: fixture,
  auth: `export async function requireUser(){return {role:location.search.includes('staff')?'STAFF':'MANAGER'}}; export function hasRole(user){return user.role==='MANAGER'};`,
  trends: `export async function loadPriceTrends(){return {}};`,
  dependencies: `export async function loadDependencyData(rootId,recipes){return {recipes,consumers:{branches:[],truncated:false}}};`,
  actions: `const capture=async(name,data)=>{window.calls??=[];window.calls.push({name,entries:[...data.entries()]});if(window.failSave && name==='updateRecipe') throw Error('test');if(window.deferSave && name==='updateRecipe') await new Promise(resolve=>{window.finishSave=resolve});};export const updateRecipe=data=>capture('updateRecipe',data);export const deleteRecipe=data=>capture('deleteRecipe',data);export const removeRecipeItem=data=>capture('removeRecipeItem',data);export const removeSubRecipe=data=>capture('removeSubRecipe',data);export const addSubRecipe=data=>capture('addSubRecipe',data);export const addRecipeIngredientWithState=async(state,data)=>{await capture('addRecipeIngredientWithState',data);return {error:''}};export const updateRecipeIngredient=async(state,data)=>{await capture('updateRecipeIngredient',data);return {error:'',saved:true}};`,
  link: `import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
  navigation: `export function notFound(){throw Error('not found')}`,
  inspector: `export function WorkspaceInspector({children}){return children}`,
};
await build({absWorkingDir:project,stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import RecipePage from './app/(app)/recipes/[id]/page';const page=await RecipePage({params:Promise.resolve({id:'recipe'})});createRoot(document.getElementById('root')).render(<div className="ops-theme"><div style={{height:56,background:'#0e1625',position:'sticky',top:0,zIndex:30,padding:16}}>Mise · Recipe workspace</div><main style={{maxWidth:1440,margin:'auto',padding:16}}>{page}</main></div>);`,resolveDir:project,loader:'tsx'},outfile:`${output}/app.js`,bundle:true,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-read-fixtures',setup(b){b.onResolve({filter:/.*/},args=>{const p=args.path;let key;if(p==='@/lib/db/prisma')key='prisma';if(p==='@/lib/auth/session')key='auth';if(p==='@/lib/invoices/price-trends-data')key='trends';if(p==='@/lib/recipes/recipe-dependencies-data')key='dependencies';if(/recipes\/actions$/.test(p)||(['../actions','./actions'].includes(p)&&args.importer.includes('/recipes/')))key='actions';if(p==='next/link')key='link';if(p==='next/navigation')key='navigation';if(p==='@/components/WorkspaceInspector')key='inspector';if(key)return {path:key,namespace:'test-stub'};});b.onLoad({filter:/.*/,namespace:'test-stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:project}));}}]});
const source = await readFile(`${project}/app/globals.css`,'utf8');
const compiler = await compile(source, {base:`${project}/app`, loadStylesheet:async(id,base)=>{const file=id==='tailwindcss'?`${project}/node_modules/tailwindcss/index.css`:path.resolve(base,id);return {content:await readFile(file,'utf8'),base:path.dirname(file),path:file};}});
const {readdir}=await import('node:fs/promises');
async function candidates(dir){const all=[];for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())all.push(...await candidates(file));else if(/\.(tsx?|css)$/.test(file))all.push(...(await readFile(file,'utf8')).split(/[\s"'`{}<>]+/));}return all;}
const css=compiler.build([...await candidates(`${project}/components`),...await candidates(`${project}/app`)]);
await writeFile(`${output}/style.css`,css+'\n'+await readFile(`${output}/app.css`,'utf8'));
await writeFile(`${output}/index.html`,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="margin:0;background:#0e1625"><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
const server=createServer(async(req,res)=>{try{const name=req.url.split('?')[0];const file=name==='/'?'index.html':name.slice(1);res.setHeader('Content-Type',file.endsWith('js')?'text/javascript':file.endsWith('css')?'text/css':'text/html');res.end(await readFile(path.join(output,file)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PREP_BROWSER_EXECUTABLE ? {executablePath:process.env.PREP_BROWSER_EXECUTABLE} : {})});
const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
try{
 await page.goto(base);await page.getByRole('heading',{name:'Caesar Dressing, Anchovy free'}).waitFor();
 assert.equal(await page.getByRole('tabpanel').count(),1);
 assert.equal(await page.locator('[role="tabpanel"]').count(),4);
 assert.equal(await page.getByRole('button',{name:'Save Changes',exact:true}).count(),1);
 assert.equal(await page.getByRole('link',{name:'Print Recipe Card',exact:true}).getAttribute('href'),'/recipes/recipe/print');
 assert.equal(await page.getByRole('link',{name:'Print with Costing',exact:true}).getAttribute('href'),'/recipes/recipe/print?costs=1');
 const snapshot=()=>page.evaluate(()=>[...new FormData(document.getElementById('recipeForm')).entries()]);
 const initial=await snapshot();assert.deepEqual([...new Set(initial.map(([key])=>key))].sort(),['id','menuPrice','yieldQty','yieldUnit','name','category','station','prepMinutes','cookMinutes','productionPersonMinutes','criticalNotes','allergen','storage','shelfLife','holdLifeDays','step'].sort());assert.equal(initial.find(([key])=>key==='holdLifeDays')[1],'3');assert.equal(initial.filter(([key])=>key==='step').length,2);
 await page.getByLabel('Step 1 details',{exact:true}).fill('Stream slowly until glossy.');
 await page.getByLabel('Name',{exact:true}).fill('Caesar Test Dressing');
 await page.getByLabel('Menu Price ($)',{exact:true}).fill('2');
 await page.getByRole('tab',{name:'HACCP & Compliance',exact:true}).click();
 await page.getByLabel('Storage Instructions',{exact:false}).fill('Covered, labeled, FIFO.');
 await page.locator('input[name="allergen"][value="sesame"]').check();
 assert.match(await page.locator('.recipe-kpis').innerText(),/Sesame/);
 await page.getByRole('tab',{name:'History / Changelog',exact:true}).click();
 const before=await snapshot();assert.equal(before.find(([key])=>key==='name')[1],'Caesar Test Dressing');assert.equal(before.find(([key])=>key==='storage')[1],'Covered, labeled, FIFO.');assert.deepEqual(before.filter(([key])=>key==='allergen').map(([,value])=>value).sort(),['mustard','sesame']);assert.match(before.find(([key])=>key==='step')[1],/Stream slowly/);
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('status').filter({hasText:'Changes saved'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.calls.find(call=>call.name==='updateRecipe').entries),before);
 assert.deepEqual(await snapshot(),before);
 await page.getByRole('button',{name:'2 times standard batch',exact:true}).click();
 assert.match(await page.locator('.recipe-kpis').innerText(),/\$18.00/);assert.deepEqual(await snapshot(),before);
 await page.getByRole('tab',{name:'Formula & Method',exact:true}).click();
 assert.match(await page.locator('#formula-item-oil').innerText(),/2 qt/);
 await page.getByRole('tab',{name:'Cost Rollup & Dependencies',exact:true}).click();assert.equal(await page.getByTestId('dependency-total-cost').innerText(),'$18.00');
 await page.getByLabel('Custom batch multiplier',{exact:true}).fill('');assert.equal(await page.getByTestId('dependency-total-cost').innerText(),'—');
 await page.getByRole('button',{name:'1 times standard batch',exact:true}).click();
 await page.getByRole('button',{name:'1 Stale Price · 90d+ ↗',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'Cost Rollup & Dependencies',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>document.activeElement.dataset.dependencyId),'oil');
 await page.getByRole('tab',{name:'Formula & Method',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('');await page.getByRole('tab',{name:'History / Changelog',exact:true}).click();const count=await page.evaluate(()=>window.calls.length);await page.getByRole('button',{name:'Save Changes',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'Formula & Method',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>document.activeElement.name),'name');assert.equal(await page.evaluate(()=>window.calls.length),count);await page.getByLabel('Name',{exact:true}).fill('Caesar Test Dressing');
 await page.getByRole('button',{name:'Move step 2 up',exact:true}).click();assert.match((await snapshot()).find(([key])=>key==='step')[1],/SEASON/);
 await page.getByRole('button',{name:'Move step 1 down',exact:true}).click();
 const quick=page.locator('.recipe-quick-add');await quick.getByRole('combobox',{name:'Add ingredient',exact:true}).fill('Kosher Salt');await page.keyboard.press('Tab');await quick.getByRole('spinbutton',{name:'Qty',exact:true}).fill('2');await page.keyboard.press('Tab');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.calls.some(call=>call.name==='addRecipeIngredientWithState'));const added=await page.evaluate(()=>window.calls.find(call=>call.name==='addRecipeIngredientWithState').entries);assert.equal(added.find(([key])=>key==='itemId')[1],'salt');assert.equal(added.find(([key])=>key==='quantity')[1],'2');
 await quick.getByRole('button',{name:'+ Sub-Recipe',exact:true}).click();await quick.getByRole('combobox',{name:'Search recipes…',exact:true}).fill('Dressing Base');await page.keyboard.press('Tab');await quick.getByRole('spinbutton',{name:'Qty',exact:true}).fill('24');await page.keyboard.press('Tab');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.calls.some(call=>call.name==='addSubRecipe'));assert.equal((await page.evaluate(()=>window.calls.find(call=>call.name==='addSubRecipe').entries)).find(([key])=>key==='quantity')[1],'24');
 await quick.getByRole('button',{name:'+ Raw Ingredient',exact:true}).click();
 await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not save'}).waitFor();assert.equal((await snapshot()).find(([key])=>key==='storage')[1],'Covered, labeled, FIFO.');await page.evaluate(()=>{window.failSave=false;window.deferSave=true});await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForFunction(()=>!!window.finishSave);await page.getByLabel('Name',{exact:true}).fill('New edits while saving');await page.evaluate(()=>window.finishSave());await page.getByRole('status').filter({hasText:'New edits unsaved'}).waitFor();
 await page.getByRole('tab',{name:'HACCP & Compliance',exact:true}).click();await page.locator('input[name="holdLifeDays"]').fill('-1');await page.getByRole('tab',{name:'Formula & Method',exact:true}).click();await page.getByRole('button',{name:'Save Changes',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'HACCP & Compliance',exact:true}).getAttribute('aria-selected'),'true');await page.locator('input[name="holdLifeDays"]').fill('3');
 await page.screenshot({path:`${output}/compliance-desktop.png`,fullPage:true});
 await page.getByRole('tab',{name:'Formula & Method',exact:true}).click();await page.screenshot({path:`${output}/formula-desktop.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok((await page.locator('.recipe-command-header h1').boundingBox()).width>300);console.log('Mobile command header height:',(await page.locator('.recipe-command-header').boundingBox()).height);assert.ok((await page.locator('.recipe-command-header').boundingBox()).height<400);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${output}/formula-mobile.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.getByRole('tab',{name:'HACCP & Compliance',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(`${base}/?staff`);await page.getByRole('heading',{name:'Caesar Dressing, Anchovy free'}).waitFor();assert.equal(await page.getByRole('button',{name:'Save Changes',exact:true}).count(),0);await page.getByRole('button',{name:'4 times standard batch',exact:true}).click();assert.match(await page.locator('.recipe-kpis').innerText(),/\$36.00/);
 assert.deepEqual(errors,[]);console.log('PASS: mounted tabs, full save payload, validation across hidden tabs, allergen inheritance, preserved edits on success/failure/in-flight save, reorder, raw/sub-recipe Tab+Enter, preview scaling/no writes, stale navigation, print routes, mobile overflow, and staff access.');console.log(output);
}catch(error){await page.screenshot({path:`${output}/failure.png`});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
