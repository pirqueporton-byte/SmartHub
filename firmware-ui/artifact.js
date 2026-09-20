/* GitHub devuelve ZIP. Sólo extraemos la aplicación, con límites y hash verificado. */
async function firmwareFromArtifact(archive, manifest) {
 if(archive.size>8*1024*1024 || !Number.isInteger(manifest.size) || manifest.size<=0 || manifest.size>2031616)throw new Error('Tamaño de firmware inválido.');
 const entries=fflate.unzipSync(new Uint8Array(await archive.arrayBuffer()),{filter:entry=>{
  if(entry.name!=='application.bin')return false;
  if(entry.originalSize!==manifest.size)throw new Error('El tamaño declarado no coincide.');
  return true;
 }});
 const bytes=entries['application.bin'];
 if(!bytes || bytes.length!==manifest.size || bytes[0]!==0xe9)throw new Error('No se encontró una aplicación ESP32 válida.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==manifest.sha256)throw new Error('El SHA-256 no coincide. No instales este archivo.');
 return new Blob([bytes],{type:'application/octet-stream'});
}
if(typeof module!=='undefined')module.exports={firmwareFromArtifact};
