import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {LineSegments2} from './vendor/lines/LineSegments2.js';
import {LineSegmentsGeometry} from './vendor/lines/LineSegmentsGeometry.js';
import {LineMaterial} from './vendor/lines/LineMaterial.js';
import {CruiseController} from './terrain-cruise.js';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=value=>value.replace(/[\s·•・（）()]/g,'').replace(/站$/,'');
const colors=globalThis.LINE_COLORS;
const view=$('#terrain-view');
let data,stationById,activeStation,activeLine='all',renderer,scene,camera,controls,vertical=8,span=34,frame=0,dirty=true,cruise,cruiseRoutes;
const terrainGroup=new THREE.Group(),routeObjects=[],markers=[],labels=[],depthObjects=[],terrainMaterials=[];
const raycaster=new THREE.Raycaster();
const cityBounds=[118.58,31.915,119.045,32.185];
const project=(lon,lat,height=0)=>new THREE.Vector3((lon-118.78)*94.416,height/1000,-(lat-32)*111.195);
const displayGround=height=>height<0?0:height;
const groundPosition=s=>project(s.coordinate.longitude,s.coordinate.latitude,displayGround(s.ground_elevation_m)*vertical);
const source=id=>data.sources.find(s=>s.id===id);
const sourceAnchor=id=>{const s=source(id);return `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a>`;};
function requestRender(){dirty=true;if(!frame)frame=requestAnimationFrame(render);}
function makeSurface(){
  const {bounds,columns:cols,rows,elevations_m:heights}=data.terrain;
  const positions=[],colorValues=[],indices=[],low=new THREE.Color('#e7ede0'),mid=new THREE.Color('#b4cba1'),high=new THREE.Color('#799562'),peak=new THREE.Color('#d8cfad');
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const height=heights[y*cols+x];
    const p=project(bounds[0]+(bounds[2]-bounds[0])*x/(cols-1),bounds[3]-(bounds[3]-bounds[1])*y/(rows-1),displayGround(height));
    positions.push(p.x,p.y,p.z);
    const c=height<100?low.clone().lerp(mid,Math.max(0,height)/100):height<350?mid.clone().lerp(high,(height-100)/250):high.clone().lerp(peak,Math.min(1,(height-350)/350));
    if(height<9)c.lerp(new THREE.Color('#dce8e7'),.4);
    if(height<0)c.set('#9da8a1');
    colorValues.push(c.r,c.g,c.b);
    if(x<cols-1&&y<rows-1){const a=y*cols+x,b=a+1,c=a+cols,d=c+1;indices.push(a,c,b,b,c,d);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colorValues,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:Number($('#terrain-opacity').value)/100,depthWrite:false});terrainMaterials.push(terrainMaterial);terrainGroup.add(new THREE.Mesh(geometry,terrainMaterial));
  const edge=[];
  for(let x=0;x<cols;x++)edge.push(x);
  for(let y=1;y<rows;y++)edge.push(y*cols+cols-1);
  for(let x=cols-2;x>=0;x--)edge.push((rows-1)*cols+x);
  for(let y=rows-2;y>0;y--)edge.push(y*cols);
  const skirt=[],skirtIndices=[];
  edge.forEach((index,i)=>{skirt.push(positions[index*3],positions[index*3+1],positions[index*3+2],positions[index*3],-.1,positions[index*3+2]);const next=(i+1)%edge.length;skirtIndices.push(i*2,next*2,i*2+1,next*2,next*2+1,i*2+1);});
  const skirtGeometry=new THREE.BufferGeometry();skirtGeometry.setAttribute('position',new THREE.Float32BufferAttribute(skirt,3));skirtGeometry.setIndex(skirtIndices);skirtGeometry.computeVertexNormals();
  const skirtMaterial=new THREE.MeshStandardMaterial({color:'#d6e0cf',side:THREE.DoubleSide,roughness:1,transparent:true,opacity:Number($('#terrain-opacity').value)/100,depthWrite:false});terrainMaterials.push(skirtMaterial);terrainGroup.add(new THREE.Mesh(skirtGeometry,skirtMaterial));
  terrainGroup.scale.y=vertical;scene.add(terrainGroup);
}
function makeRoutes(){
  for(const line of data.lines){
    const positions=[];
    for(const way of data.ways.filter(w=>w.line_ids.includes(line.id)))for(let i=1;i<way.geometry.length;i++)for(const p of [way.geometry[i-1],way.geometry[i]]){
      const point=project(p[0],p[1],displayGround(p[2])+2);positions.push(point.x,point.y,point.z);
    }
    const geometry=new LineSegmentsGeometry();geometry.setPositions(positions);
    const material=new LineMaterial({color:colors[line.id],linewidth:3.5,transparent:true,opacity:.95,depthTest:false,depthWrite:false,toneMapped:false});
    material.resolution.set(view.clientWidth,view.clientHeight);
    const haloMaterial=new LineMaterial({color:'#ffffff',linewidth:5.5,transparent:true,opacity:.65,depthTest:false,depthWrite:false,toneMapped:false});haloMaterial.resolution.copy(material.resolution);
    const halo=new LineSegments2(geometry,haloMaterial);halo.renderOrder=4;terrainGroup.add(halo);
    const object=new LineSegments2(geometry,material);object.renderOrder=5;object.userData={lineId:line.id,halo};terrainGroup.add(object);routeObjects.push(object);
  }
  const dotCanvas=document.createElement('canvas');dotCanvas.width=dotCanvas.height=32;
  const dotContext=dotCanvas.getContext('2d');dotContext.beginPath();dotContext.arc(16,16,12,0,Math.PI*2);dotContext.fillStyle='#fcfff8';dotContext.fill();dotContext.lineWidth=3;dotContext.strokeStyle='#547554';dotContext.stroke();
  const markerTexture=new THREE.CanvasTexture(dotCanvas);markerTexture.colorSpace=THREE.SRGBColorSpace;
  for(const station of data.stations.filter(s=>s.coordinate)){
    const material=new THREE.SpriteMaterial({map:markerTexture,color:'#ffffff',transparent:true,depthTest:false,depthWrite:false});
    const mesh=new THREE.Sprite(material);mesh.position.copy(groundPosition(station));mesh.userData.stationId=station.id;mesh.renderOrder=6;scene.add(mesh);markers.push(mesh);
    const label=document.createElement('button');label.type='button';label.className='terrain-label';label.textContent=station.name;label.dataset.mapStation=station.id;label.setAttribute('aria-label',`查看${station.name}站海拔`);label.tabIndex=-1;$('#terrain-labels').append(label);labels.push({station,element:label});
    for(const observation of station.engineering_observations.filter(o=>o.reference==='local_ground')){
      const top=groundPosition(station),bottom=top.clone();bottom.y-=observation.value_m/1000*vertical;
      const geometry=new THREE.BufferGeometry().setFromPoints([top,bottom]);
      const rod=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:'#607986',dashSize:.05,gapSize:.03,transparent:true,opacity:.95,depthTest:false,depthWrite:false}));rod.computeLineDistances();rod.visible=$('#show-depth').checked;rod.renderOrder=7;rod.userData={station,observation};scene.add(rod);depthObjects.push(rod);
    }
  }
}
function resize(){
  if(!renderer)return;
  const width=view.clientWidth,height=view.clientHeight;
  renderer.setSize(width,height);const aspect=width/height;
  camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
  for(const route of routeObjects){route.material.resolution.set(width,height);route.userData.halo.material.resolution.set(width,height);}
  if(data&&activeStation)renderProfile();
  requestRender();
}
function fit(bounds,name,direction){
  const a=project(bounds[0],bounds[1]),b=project(bounds[2],bounds[3]);
  const target=new THREE.Vector3((a.x+b.x)/2,.5,(a.z+b.z)/2);
  const vector=direction||camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(target).addScaledVector(vector,150);controls.target.copy(target);camera.zoom=1;controls.update();
  const inverse=camera.quaternion.clone().invert(),corners=[];
  for(const x of [a.x,b.x])for(const z of [a.z,b.z])for(const y of [0,4])corners.push(new THREE.Vector3(x,y,z).sub(target).applyQuaternion(inverse));
  const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
  span=Math.max((Math.max(...xs)-Math.min(...xs))/(view.clientWidth/view.clientHeight),Math.max(...ys)-Math.min(...ys),5)*1.15;
  $('#view-name').textContent=name;resize();
}
function lineBounds(id){
  const coords=data.ways.filter(w=>w.line_ids.includes(id)).flatMap(w=>w.geometry);
  return [Math.min(...coords.map(p=>p[0]))-.02,Math.min(...coords.map(p=>p[1]))-.02,Math.max(...coords.map(p=>p[0]))+.02,Math.max(...coords.map(p=>p[1]))+.02];
}
function chooseLine(id,zoom=true,keepStation=false){
  cruise?.pause('线路切换 · 手动观察');
  activeLine=id;
  for(const button of $('#terrain-lines').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.line===id));
  for(const route of routeObjects){const selected=route.userData.lineId===id;route.material.opacity=(id==='all'||selected)? .96 : .15;route.material.linewidth=id==='all'?3.5:selected?6.2:2;route.userData.halo.material.opacity=id==='all'?.65:selected?.9:0;route.userData.halo.material.linewidth=selected?8.8:5.5;}
  if(id!=='all'&&(!keepStation||!activeStation.line_ids.includes(id)))selectStation(data.lines.find(l=>l.id===id).station_ids[0],false,true);
  if(zoom)fit(id==='all'?cityBounds:lineBounds(id),id==='all'?'主城视角':`${id} 号线视角`);
  if(cruise&&id!=='all')cruise.setRoute(id,activeStation.id);
  document.documentElement.style.setProperty('--route-color',colors[id]||'#188bc4');
  renderStation();requestRender();
}
function selectStation(id,zoom=true,fromCruise=false){
  const station=stationById.get(id);if(!station)return;activeStation=station;$('#terrain-search').value=station.name;
  if(!fromCruise){
    cruise?.pause('车站定位 · 手动观察');
    if(activeLine!=='all'&&!station.line_ids.includes(activeLine))chooseLine(station.line_ids[0],false,true);
    if(activeLine==='all'&&cruise&&!cruise.route.stations.some(s=>s.station_id===id)&&cruiseRoutes.get(station.line_ids[0]).stations.some(s=>s.station_id===id))cruise.setRoute(station.line_ids[0],id);
    cruise?.seekStation(id);
    if(!station.coordinate){cruise?.pause('车站坐标待补 · 可巡航其他已定位站');fit(lineBounds(station.line_ids[0]),`${station.name} · 坐标待补`);}
  }
  if(station.coordinate&&zoom){const c=station.coordinate;fit([c.longitude-.052,c.latitude-.04,c.longitude+.052,c.latitude+.04],`${station.name}附近`);}
  renderStation();requestRender();
}
function renderStation(){
  const s=activeStation;if(!s)return;
  for(const entry of labels)entry.element.classList.toggle('active',entry.station.id===s.id);
  if(s.coordinate&&!labels.some(l=>l.station.id===s.id)){const element=document.createElement('span');element.className='terrain-label active';element.textContent=s.name;$('#terrain-labels').append(element);labels.push({station:s,element});}
  $('#terrain-station-detail').innerHTML=`<div class="station-summary"><p class="detail-kicker">STATION / 车站高程</p><h2>${escape(s.name)}</h2><div class="detail-line-badges">${s.line_ids.map(id=>`<span class="line-badge" style="--line-color:${colors[id]}">${id}</span>`).join('')}</div><p class="coordinate-fact">${s.coordinate?`${s.coordinate.latitude.toFixed(5)}° N / ${s.coordinate.longitude.toFixed(5)}° E<br>${s.coordinate.method==='official_address_osm_junction_approx'?'官网地址路口近似定位 · 站体中心待核对':'WGS84 · OSM 车站位置'}`:'尚未匹配可靠公开坐标。'}</p><a class="detail-link" href="./?station=${encodeURIComponent(s.name)}#station-info">查本车站资料与厕所 ↗</a></div><div class="station-elevation"><div class="elevation-fact"><span>站点位置的地表海拔 · 约值</span><strong>${s.ground_elevation_m===null?'待补':Math.round(s.ground_elevation_m)}<small>${s.ground_elevation_m===null?'':'m'}</small></strong><p>EGM96 高程参考 · 栅格采样</p></div><div class="rail-fact"><span>轨面绝对标高</span><strong>${s.rail_elevation_status==='reference_only'?'有参考值 · 基准未注明':'尚未收集'}</strong></div></div>${s.engineering_observations.length?`<section class="engineering-fact"><h3>公开工程资料</h3>${s.engineering_observations.map(o=>`<div class="engineering-record"><p>${escape(o.description)}</p><small>${escape(source(o.source_id).published_at||'')} · ${escape(o.source_locator)}</small>${sourceAnchor(o.source_id)}</div>`).join('')}</section>`:''}`;
  $('#map-selection').textContent=`${s.name} · ${s.ground_elevation_m===null?'海拔待补':'地表约 '+Math.round(s.ground_elevation_m)+' m'} · 轨面高程待补`;
  renderProfile();
}
function renderProfile(){
  const line=data.lines.find(l=>l.id===(activeLine==='all'?activeStation.line_ids[0]:activeLine));
  const route=cruiseRoutes.get(line.id),events=new Map(route.stations.map(s=>[s.station_id,s]));
  const stations=line.station_ids.map(id=>stationById.get(id));
  const values=stations.map(s=>s.ground_elevation_m),valid=values.filter(v=>v!==null);
  const min=Math.floor(Math.min(...valid)/10)*10,max=Math.max(min+10,Math.ceil(Math.max(...valid)/10)*10);
  const width=Math.max(260,$('#terrain-profile').clientWidth-36),xy=s=>[24+events.get(s.id).distance_m/route.length_m*(width-48),82-(s.ground_elevation_m-min)/(max-min)*59];
  const segments=[];let current=[];
  stations.forEach(s=>{if(s.ground_elevation_m===null||!events.has(s.id)){if(current.length)segments.push(current);current=[];}else current.push(xy(s));});if(current.length)segments.push(current);
  const paths=segments.map(points=>`<path d="M ${points.map(p=>p.join(' ')).join(' L ')}" fill="none" stroke="${colors[line.id]}" stroke-width="1.8"/>`).join('');
  const selected=stations.findIndex(s=>s.id===activeStation.id);
  $('#terrain-profile').innerHTML=`<h3>${line.id} 号线 · 车站地表海拔</h3><svg viewBox="0 0 ${width} 106" role="group" aria-label="沿线车站地表海拔，点击圆点可定位"><path d="M24 23H${width-24}M24 82H${width-24}" stroke="#dfe7d8" stroke-dasharray="3 4"/><text x="24" y="15" fill="#809475" font-size="9">${max} m</text><text x="10" y="86" fill="#809475" font-size="8">${min}</text><text x="24" y="102" fill="#809475" font-size="9">0 km</text><text x="${width/2}" y="102" text-anchor="middle" fill="#809475" font-size="9">${(route.length_m/2000).toFixed(1)} km</text><text x="${width-24}" y="102" text-anchor="end" fill="#809475" font-size="9">${(route.length_m/1000).toFixed(1)} km</text>${paths}<line id="profile-cursor" data-width="${width}" x1="24" x2="24" y1="20" y2="87" stroke="${colors[line.id]}" stroke-width="1.5" stroke-dasharray="3 3" opacity=".65"/>${stations.map((s,i)=>s.ground_elevation_m===null||!events.has(s.id)?'':`<circle cx="${xy(s)[0]}" cy="${xy(s)[1]}" r="${i===selected?5:3}" fill="${i===selected?colors[line.id]:'#fdfef9'}" stroke="${colors[line.id]}" data-profile-station="${s.id}" tabindex="0" role="button" aria-label="定位${escape(s.name)}，地表约${Math.round(s.ground_elevation_m)}米"><title>${escape(s.name)} · 约 ${Math.round(s.ground_elevation_m)} m</title></circle>`).join('')}</svg><p>地表估值 · 横轴为图上距离 · 非轨道纵断面</p>`;
  if(cruise?.route?.line_id===line.id)cruise.updateProfileCursor();
}
function render(time){
  frame=0;
  const cruising=cruise?.update(time);if(cruising)dirty=true;
  const changing=controls.update();
  if(dirty||changing){
    dirty=false;
    const pixel=span/camera.zoom/view.clientHeight;
    for(const marker of markers){const station=stationById.get(marker.userData.stationId),selected=station.id===activeStation.id,onLine=activeLine==='all'||station.line_ids.includes(activeLine);marker.scale.setScalar(pixel*(selected?14:onLine?8:4));marker.material.color.set(selected?'#345f36':'#ffffff');marker.material.opacity=onLine?1:.12;}
    renderer.render(scene,camera);
    const occupied=[];
    const sorted=[...labels].sort((a,b)=>(b.station.id===activeStation.id)-(a.station.id===activeStation.id));
    const important=['新街口','南京南站','鼓楼','鸡鸣寺','夫子庙','莫愁湖','元通','南京站','金马路','翔宇路南','金牛湖','高淳','栖霞山','太白'];
    for(const label of sorted){
      const s=label.station,p=groundPosition(s).project(camera),x=(p.x+1)/2*view.clientWidth,y=(1-p.y)/2*view.clientHeight;
      const selected=s.id===activeStation.id,eligible=selected||(activeLine==='all'?important.includes(s.name):s.line_ids.includes(activeLine));
      const halfWidth=Math.max(29,s.name.length*5.8+9),box=[x-halfWidth,y-29,x+halfWidth,y];
      const collision=occupied.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]);
      const visible=eligible&&p.z>-1&&p.z<1&&x>halfWidth&&x<view.clientWidth-halfWidth&&y>45&&y<view.clientHeight-101&&!(x<240&&y<223)&&!collision;
      label.element.hidden=!visible;label.element.tabIndex=visible?0:-1;if(visible){label.element.style.left=x+'px';label.element.style.top=(y-10)+'px';occupied.push(box);}
    }
    const center=controls.target.clone().project(camera),north=controls.target.clone().add(new THREE.Vector3(0,0,-1)).project(camera);
    const angle=Math.atan2(north.x-center.x,north.y-center.y)*180/Math.PI;$('#north-arrow').style.transform=`rotate(${angle}deg)`;
  }
  if(changing||cruising)requestRender();
}
function showSources(){
  const text=[
    ['平面坐标与线路走向','osm-metro',`公开 OSM 快照 ${data.sources[0].osm_timestamp.slice(0,10)}，沿用官网站点 ID。个别站体有多个公共节点，采用节点平均位置；不是实测站台中心。`],
    ['地表海拔','mapzen-terrain',`Terrarium 高程瓦片，当前取样像素间距约 65 米；底层数据以 SRTM 等历史测高为主。地形展示网格间距约 ${data.terrain.mesh_spacing_m_approx.join(' × ')} 米，站点、线路仍直接采样原瓦片。栅格值按双线性插值，整数显示避免暗示测量精度。`],
    ['地下与高架','osm-track-details','轨道标签保留 tunnel / bridge / layer。layer 是相对上下层级，不是米数；未将其转成隧道深度。'],
    ['工程标高与结构深度','mochou-patent','原文标高、基坑/结构埋深分别保存。高程基准未注明的轨面数值只列为参考，不接入真实轨道高度。深度杆锚定栅格地表，是相对深度示意。']
  ];
  $('#terrain-source-notes').innerHTML=text.map(([heading,id,note])=>`<div class="source-note-row"><strong>${heading}</strong><p>${note}</p><p>${sourceAnchor(id)}</p></div>`).join('');
  $('#terrain-source-notes').insertAdjacentHTML('beforeend',`<div class="source-note-row"><strong>按线路巡航</strong><p>沿原始 OSM 节点连通的轨道生成端到端路径，再投影车站位置。图上距离按轨道水平几何计算，不是官方营业里程；速度是演示节奏，不是列车实际运行速度。游标高程沿段插值，站点详情为车站坐标处的瓦片采样，两个位置可能存在差异。结构标签和相对 layer 均保留原始来源，未据此推算实际埋深。</p><p><a href="data/cruise-routes.json" download="南京地铁-线路巡航资料.json">下载巡航路径与沿段来源 JSON ↗</a></p></div>`);
  $('#terrain-source-notes').insertAdjacentHTML('beforeend',`<div class="source-note-row"><strong>待核对范围</strong><p>${data.stats.suspect_terrain_samples} 个地形网格采样、${data.stats.suspect_way_vertices} 个线路地表采样为负高程，暂列为疑似异常。原始值保留在 JSON；地图将负值暂置于 0 米，地形标灰。0 米只是显示占位，不能解释为已核实的海拔或河底深度。</p><p>坐标待补：${escape(data.collection_issues.missing_station_coordinates.join('、')||'无')}。OSM 路线中有官网目录之外的站名：${escape(data.collection_issues.osm_stations_outside_official_roster.join('、')||'无')}，未擅自加入站点目录。</p></div>`);
  if(data.stats.approximate_junction_stations)$('#terrain-source-notes').insertAdjacentHTML('beforeend',`<div class="source-note-row"><strong>红山新城站近似定位</strong><p>该站不在本次 OSM 车站节点快照中。依据官网明确的地址，与 OSM 恒嘉路、大壮观路公共路口节点匹配；站体中心仍待人工核对。</p>${sourceAnchor('hongshan-junction')}</div>`);
  $('#terrain-data-count').textContent=`${data.stats.located_stations} / ${data.stats.stations} 站已定位 · ${data.stats.lines} 条线路 · ${data.stats.stations_with_engineering_references} 站有工程参考资料`;
}
async function main(){
  const responses=await Promise.all([fetch('data/metro-3d.json'),fetch('data/cruise-routes.json')]);if(responses.some(r=>!r.ok))throw new Error('地理资料暂未载入');data=await responses[0].json();const paths=await responses[1].json();cruiseRoutes=new Map(paths.routes.map(r=>[r.line_id,r]));stationById=new Map(data.stations.map(s=>[s.id,s]));
  vertical=Number($('#vertical-scale').value);$('#vertical-scale-value').value=vertical+' ×';
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.domElement.setAttribute('tabindex','0');renderer.domElement.setAttribute('aria-label','南京地铁立体地形图：拖动旋转，右键平移；左右方向键旋转，加减键缩放，0复位。');view.prepend(renderer.domElement);
  scene=new THREE.Scene();const syncSceneStyle=()=>{scene.background=new THREE.Color(document.documentElement.dataset.style==='paper'?'#f7f5f0':'#f8faf6');requestRender();};syncSceneStyle();window.addEventListener('metro:style-change',syncSceneStyle);scene.add(new THREE.HemisphereLight('#ffffff','#b6c7a4',1.3));const light=new THREE.DirectionalLight('#fff7e8',1.8);light.position.set(-40,80,25);scene.add(light);
  const grid=new THREE.GridHelper(160,64,'#bccbbd','#d9e3d5');grid.position.y=0;grid.material.transparent=true;grid.material.opacity=.22;grid.material.depthWrite=false;scene.add(grid);
  camera=new THREE.OrthographicCamera(-30,30,20,-20,.01,1000);camera.position.set(40,70,65);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.minPolarAngle=.04;controls.maxPolarAngle=Math.PI*.48;controls.minZoom=.22;controls.maxZoom=25;controls.screenSpacePanning=true;controls.addEventListener('change',requestRender);
  activeStation=data.stations.find(s=>s.name==='新街口');
  makeSurface();makeRoutes();
  $('#terrain-lines').innerHTML='<button type="button" data-line="all" aria-pressed="true">全部线路</button>'+data.lines.map(l=>`<button type="button" data-line="${l.id}" aria-pressed="false" style="--line-color:${colors[l.id]}" aria-label="查看${l.id}号线立体走向"><i></i>${l.id}</button>`).join('');
  $('#terrain-station-list').innerHTML=data.stations.map(s=>`<option value="${escape(s.name)}">${s.line_ids.join(' / ')} 号线</option>`).join('');
  $('#cruise-line').innerHTML=data.lines.map(l=>`<option value="${l.id}">${l.id} 号线</option>`).join('');
  cruise=new CruiseController({scene,camera,controls,colors,project,routes:cruiseRoutes,requestRender,getVertical:()=>vertical,getSpan:()=>span,getPixel:()=>span/camera.zoom/view.clientHeight,getActiveLine:()=>activeLine,onLine:id=>chooseLine(id),onStation:id=>selectStation(id,false,true)});
  showSources();fit(cityBounds,'主城视角',new THREE.Vector3(.36,.73,.58).normalize());chooseLine('1');$('#map-loading').hidden=true;
  $('#terrain-lines').addEventListener('click',e=>{const button=e.target.closest('[data-line]');if(button)chooseLine(button.dataset.line);});
  $('#all-network').addEventListener('click',()=>{chooseLine('all',false);fit(data.terrain.bounds,'全网视角');});
  $('#view-reset').addEventListener('click',()=>{chooseLine('all',false);fit(cityBounds,'主城视角',new THREE.Vector3(.36,.73,.58).normalize());});
  $('#view-top').addEventListener('click',()=>{cruise.pause('俯视 · 手动观察');const delta=camera.position.clone().sub(controls.target).length();camera.position.copy(controls.target).add(new THREE.Vector3(0,delta,.001));controls.update();requestRender();});
  $('#view-oblique').addEventListener('click',()=>{cruise.pause('立体 · 手动观察');camera.position.copy(controls.target).add(new THREE.Vector3(54,110,87));controls.update();requestRender();});
  $('#vertical-scale').addEventListener('input',e=>{
    vertical=Number(e.target.value);terrainGroup.scale.y=vertical;$('#vertical-scale-value').value=vertical+' ×';
    for(const marker of markers)marker.position.copy(groundPosition(stationById.get(marker.userData.stationId)));
    for(const rod of depthObjects){const {station,observation}=rod.userData,top=groundPosition(station),bottom=top.clone();bottom.y-=observation.value_m/1000*vertical;rod.geometry.setFromPoints([top,bottom]);rod.computeLineDistances();}cruise.updatePosition(false,cruise.playing);cruise.sync();requestRender();
  });
  const setTerrainOpacity=value=>{for(const material of terrainMaterials)material.opacity=value/100;for(const object of terrainGroup.children)if(terrainMaterials.includes(object.material))object.visible=value>0;$('#terrain-opacity').value=value;$('#view-clean').setAttribute('aria-pressed',String(value===0));requestRender();};
  setTerrainOpacity(Number($('#terrain-opacity').value));
  $('#terrain-opacity').addEventListener('input',e=>setTerrainOpacity(Number(e.target.value)));
  $('#view-clean').addEventListener('click',()=>setTerrainOpacity(Number($('#terrain-opacity').value)===0?30:0));
  $('#show-depth').addEventListener('change',e=>{for(const rod of depthObjects)rod.visible=e.target.checked;requestRender();});
  $('#terrain-search').addEventListener('focus',()=>cruise.pause('搜索车站 · 手动观察'));
  $('#terrain-labels').addEventListener('click',e=>{const button=e.target.closest('[data-map-station]');if(button)selectStation(button.dataset.mapStation,false);});
  $('#terrain-search-form').addEventListener('submit',e=>{e.preventDefault();const query=normalize($('#terrain-search').value.trim());const matches=data.stations.filter(s=>normalize(s.name)===query);if(matches.length===1){$('#terrain-search-status').textContent='';selectStation(matches[0].id);}else $('#terrain-search-status').textContent='请输入完整站名，或从输入建议中选择。';});
  $('#terrain-profile').addEventListener('click',e=>{const target=e.target.closest('[data-profile-station]');if(target)selectStation(target.dataset.profileStation);});
  $('#terrain-profile').addEventListener('keydown',e=>{const target=e.target.closest('[data-profile-station]');if(target&&['Enter',' '].includes(e.key)){e.preventDefault();selectStation(target.dataset.profileStation);}});
  let start;const pointers=new Set();
  renderer.domElement.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);start=pointers.size===1&&e.button===0?{x:e.clientX,y:e.clientY}:null;});
  renderer.domElement.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);start=null;});
  renderer.domElement.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);const click=start;start=null;if(!click||Math.hypot(e.clientX-click.x,e.clientY-click.y)>5)return;const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=raycaster.intersectObjects(markers).find(h=>h.object.material.opacity>.2);if(hit)selectStation(hit.object.userData.stationId,false);});
  renderer.domElement.addEventListener('keydown',e=>{if(['+','=','-','ArrowLeft','ArrowRight'].includes(e.key))cruise.pause('键盘观察 · 巡航已暂停');if(['+','=','-'].includes(e.key)){e.preventDefault();camera.zoom=THREE.MathUtils.clamp(camera.zoom*(e.key==='-'?.8:1.25),.22,25);camera.updateProjectionMatrix();requestRender();}if(e.key==='0'){e.preventDefault();$('#view-reset').click();}if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),e.key==='ArrowLeft'?.12:-.12);camera.position.copy(controls.target).add(offset);controls.update();requestRender();}});
  new ResizeObserver(resize).observe(view);requestRender();
}
main().catch(error=>{console.error(error);$('#map-loading').innerHTML=`<span>三维图暂时无法载入：${escape(error.message)}</span><a href="./#network">查看平面线网和站点资料 ↗</a>`;});
