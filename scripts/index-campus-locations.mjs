// Rebuild the small calendar lookup from the paired Blender GLB coordinate catalog.
import {readFileSync,writeFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../public/campus/coordinates.json',import.meta.url),'utf8'));
const groups=new Map();
for(const feature of catalog.features){
  if(feature.status==='planned'||feature.status==='relocated-location-unverified'||/^(Unnamed|Athletic field or court|Water feature)/.test(feature.name))continue;
  const namedCode=catalog.features.find(f=>f.name===feature.name&&f.code)?.code;
  const key=feature.code||namedCode||feature.name;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(feature);
}
const area=f=>(f.bounds.max[0]-f.bounds.min[0])*(f.bounds.max[2]-f.bounds.min[2]);
const locations=[...groups.values()].map(parts=>{
  parts.sort((a,b)=>Number(Boolean(b.code))-Number(Boolean(a.code))||area(b)-area(a));
  const f=parts[0];
  return {id:f.id,code:f.code,name:f.name,position:f.labelPosition,featureIds:parts.map(p=>p.id)};
});
writeFileSync(new URL('../data/campus-locations.json',import.meta.url),JSON.stringify(locations));
console.log(`Indexed ${locations.length} campus locations.`);
