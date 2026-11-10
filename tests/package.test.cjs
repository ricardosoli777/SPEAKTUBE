const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
test('manifest points to existing resources and valid scripts',()=>{
 const resources=[manifest.background.service_worker,'popup.html',manifest.options_page,...manifest.content_scripts.flatMap(item=>item.js),...Object.values(manifest.icons)];
 for(const file of resources)assert.ok(fs.existsSync(path.join(root,file)),file);
 for(const file of [...manifest.content_scripts.flatMap(item=>item.js),manifest.background.service_worker,'popup.js'])new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
 assert.ok(manifest.content_scripts.some(item=>item.world==='ISOLATED'));assert.ok(manifest.web_accessible_resources[0].resources.includes('popup.html')); assert.equal(manifest.action.default_popup,undefined);
});
test('page-to-extension message ID agrees with manifest key',()=>{
 const bytes=crypto.createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16);const id=[...bytes].map(byte=>String.fromCharCode(97+(byte>>4),97+(byte&15))).join('');
 const source=fs.readFileSync(path.join(root,'webpage.bundle.hdh2cnbfpdin.js'),'utf8');assert.ok(source.includes('chatId:"'+id+'"'));
});
test('panel uses local external scripts and no legacy popup bundle',()=>{
 const html=fs.readFileSync(path.join(root,'popup.html'),'utf8');assert.ok(!html.includes('popup.bundle.'));assert.ok(!/<script(?![^>]*src=)[^>]*>/i.test(html));
 for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
});


test('SpeakTube has its own identity and every runtime bridge uses it',()=>{
 const bytes=crypto.createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16);
 const id=[...bytes].map(byte=>String.fromCharCode(97+(byte>>4),97+(byte&15))).join('');
 assert.notEqual(id,'fjoiihoancoimepbgfcmopaciegpigpa');
 for(const file of ['edge-voice-engine.js','edge_tts_server.py']){
  const source=fs.readFileSync(path.join(root,file),'utf8');assert.ok(source.includes(id),file);assert.ok(!source.includes('fjoiihoancoimepbgfcmopaciegpigpa'),file);
 }
});


test('voice onboarding has external scripts and the native messaging permission',()=>{
 assert.ok(manifest.permissions.includes('nativeMessaging'));
 const html=fs.readFileSync(path.join(root,'setup.html'),'utf8');assert.ok(!/<script(?![^>]*src=)[^>]*>/i.test(html));
 for(const file of ['setup.js','setup.css','installer/voice_service.py','installer/install_core.py','installer/setup_app.py','installer/build_installer.py'])assert.ok(fs.existsSync(path.join(root,file)),file);
 new vm.Script(fs.readFileSync(path.join(root,'setup.js'),'utf8'));
});


test('optional Edge installer CTA is available inside the popup with reduced-motion support',()=>{
 const html=fs.readFileSync(path.join(root,'popup.html'),'utf8'),css=fs.readFileSync(path.join(root,'popup.css'),'utf8');assert.match(html,/id="edge-install-cta"/);assert.match(html,/download="SpeakTubeVoiceSetup.exe"/);assert.match(css,/prefers-reduced-motion/);
});
