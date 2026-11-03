import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The styled HTML is the source; regenerate the matching Markdown after edits.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'roadmap.html'),'utf8');
const plain=(value)=>value.replace(/<a\b[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,'[$2](#$1)').replace(/<br\s*\/?\s*>/g,' ').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
const take=(source,pattern)=>plain(source.match(pattern)?.[1]||'');
const features=[...html.matchAll(/<article class="feature" id="(feature-\d+)">([\s\S]*?)<\/article>/g)];
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const [,id]of html.matchAll(/href="#([^"]+)"/g))if(!ids.has(id))throw new Error(`Broken roadmap link: ${id}`);
let md='# Tetris — Feature Roadmap\n\n';
md+=`Updated: ${take(html, /PRODUCT ROADMAP · ([^<]+)/)}\n\n`;
md+=`${features.length} roadmap features · 4 delivery phases · Dependency-led order · No committed release dates\n\n`;
md+='[Open the styled HTML version](roadmap.html)\n\n';
md+=take(html,/<section class="hero"[\s\S]*?<p>([\s\S]*?)<\/p>/)+'\n\n';
const baseline=html.match(/<section class="baseline"[\s\S]*?<\/section>/)?.[0]||'';
md+='## Existing foundation\n\n'+take(baseline,/<p>([\s\S]*?)<\/p>/)+'\n\n';
for(const phase of html.matchAll(/<section class="phase[^"\n]*" id="([^"]+)"[\s\S]*?<div class="phase-heading">([\s\S]*?)<div class="feature-grid">([\s\S]*?)<\/div><\/section>/g)){
 md+=`<a id="${phase[1]}"></a>\n\n## ${take(phase[2],/<span class="phase-number">([^<]+)<\/span>/)} — ${take(phase[2],/<h2[^>]*>([\s\S]*?)<\/h2>/)}\n\n${take(phase[2],/<p>([\s\S]*?)<\/p>/)}\n\n`;
 for(const [,id,content]of phase[3].matchAll(/<article class="feature" id="([^"]+)">([\s\S]*?)<\/article>/g)){
  md+=`<a id="${id}"></a>\n\n### ${id.replace('feature-','').padStart(2,'0')}. ${take(content,/<h3>([\s\S]*?)<\/h3>/)}\n\n**Status:** ${take(content,/<span class="status[^"]*">([^<]+)<\/span>/)}\n\n${take(content,/<p class="outcome">([\s\S]*?)<\/p>/)}\n\n`;
  for(const [,item]of content.matchAll(/<li>([\s\S]*?)<\/li>/g))md+=`- ${plain(item)}\n`;
  md+='\n**Ready when:** '+take(content,/<div class="acceptance">[\s\S]*?<p>([\s\S]*?)<\/p>/)+'\n\n';
  md+='**Dependencies:** '+take(content,/<div class="depends">([\s\S]*?)<\/div>/).replace(/^Depends on: /,'')+'\n\n';
 }
}
md+='## Recommended delivery path\n\n'+take(html,/<div class="sequence">[\s\S]*?<p>([\s\S]*?)<\/p>/)+'\n\n';
for(const [,title,items]of html.matchAll(/<div><h2>([^<]+)<\/h2><ul>([\s\S]*?)<\/ul><\/div>/g)){
 md+=`## ${plain(title)}\n\n`;for(const [,item]of items.matchAll(/<li>([\s\S]*?)<\/li>/g))md+=`- ${plain(item)}\n`;md+='\n';
}
md+='---\n\n'+take(html,/<footer><span>([\s\S]*?)<\/span>/)+'\n';
if((md.match(/^### \d+\./gm)||[]).length!==features.length)throw new Error('Markdown feature count does not match HTML.');
fs.writeFileSync(path.join(root,'roadmap.md'),md);
console.log(`Synchronized ${features.length} features into roadmap.md; internal HTML links verified.`);

