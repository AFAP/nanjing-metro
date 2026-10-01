import * as THREE from 'three';
import {sampleRoute,nearestStationIndex,routeSegmentIndex} from './cruise-path.js';

export class CruiseController{
  constructor(options){
    Object.assign(this,options);this.route=null;this.distance=0;this.direction=1;this.speed=1;this.playing=false;this.lastTime=0;this.lastStation=null;this.lastHud=0;this.follow=true;this.message='选择线路，开始漫游';
    this.$=selector=>document.querySelector(selector);
    this.speed=Number(this.$('#cruise-speed').value)||1;this.follow=this.$('#cruise-follow').checked;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d');const glow=ctx.createRadialGradient(64,64,12,64,64,62);glow.addColorStop(0,'#ffffff');glow.addColorStop(.35,'#ffffffef');glow.addColorStop(.6,'#ffffff66');glow.addColorStop(1,'#ffffff00');ctx.fillStyle=glow;ctx.fillRect(0,0,128,128);ctx.beginPath();ctx.arc(64,64,26,0,Math.PI*2);ctx.fillStyle='#248bc2';ctx.fill();ctx.lineWidth=7;ctx.strokeStyle='#ffffff';ctx.stroke();
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.guideContext=ctx;this.guideTexture=texture;
    this.guide=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));this.guide.renderOrder=11;this.guide.visible=false;this.scene.add(this.guide);
    this.ruler=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#4e8090',dashSize:.07,gapSize:.04,transparent:true,opacity:.75,depthTest:false,depthWrite:false,toneMapped:false}));this.ruler.renderOrder=9;this.ruler.visible=false;this.scene.add(this.ruler);
    this.bind();
  }
  bind(){
    this.$('#cruise-play').addEventListener('click',()=>this.playing?this.pause():this.play());
    this.$('#cruise-prev').addEventListener('click',()=>this.stepStation(-1));
    this.$('#cruise-next').addEventListener('click',()=>this.stepStation(1));
    this.$('#cruise-reverse').addEventListener('click',()=>{
      this.direction*=-1;
      if(this.direction<0&&this.distance<1)this.distance=this.route.length_m;
      if(this.direction>0&&this.distance>this.route.length_m-1)this.distance=0;
      this.message=this.playing?'巡航中':'方向已切换';this.updatePosition(true);this.sync();this.requestRender();
    });
    this.$('#cruise-line').addEventListener('change',e=>this.onLine(e.target.value));
    this.$('#cruise-speed').addEventListener('change',e=>{this.speed=Number(e.target.value);this.sync();});
    this.$('#cruise-follow').addEventListener('change',e=>{this.follow=e.target.checked;if(this.follow){this.focusCamera(1);this.requestRender();}});
    this.$('#cruise-progress').addEventListener('input',e=>{const distance=Number(e.target.value)/1000*this.route.length_m;this.pause('拖动进度 · 手动查看');this.distance=distance;this.updatePosition(true);this.sync();this.requestRender();});
    this.controls.addEventListener('start',()=>this.pause('自由观察 · 随时继续巡航'));
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.playing)this.pause('页面离开 · 巡航已暂停');});
  }
  setRoute(id,stationId){
    this.pause();this.route=this.routes.get(id);if(!this.route)return;
    this.direction=1;this.distance=this.route.stations.find(s=>s.station_id===stationId)?.distance_m||0;
    this.lastStation=null;this.message='就绪 · 可巡航或手动观察';this.$('#cruise-line').value=id;
    this.guide.visible=true;this.ruler.visible=true;
    const ctx=this.guideContext;ctx.beginPath();ctx.arc(64,64,26,0,Math.PI*2);ctx.fillStyle=this.colors[id];ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.stroke();this.guideTexture.needsUpdate=true;
    this.updatePosition(false,!stationId||this.route.stations.some(s=>s.station_id===stationId));this.sync();this.requestRender();
  }
  play(){
    const id=this.$('#cruise-line').value;
    const previous=this.route?.line_id===id?this.distance:null;
    if(this.getActiveLine()!==id){this.onLine(id);if(previous!==null)this.distance=previous;}
    if(!this.route)return;
    if((this.direction>0&&this.distance>=this.route.length_m-1)||(this.direction<0&&this.distance<=1))this.distance=this.direction>0?0:this.route.length_m;
    this.playing=true;this.message='沿线巡航中';this.lastTime=performance.now();this.updatePosition();this.sync();this.requestRender();
  }
  pause(message='已暂停 · 继续可从此处出发'){
    this.playing=false;this.message=message;if(this.route)this.sync();
  }
  seekStation(id,focus=false){
    const station=this.route?.stations.find(s=>s.station_id===id);if(!station)return;
    this.pause('车站定位 · 手动观察');this.distance=station.distance_m;this.updatePosition(focus);this.sync();this.requestRender();
  }
  stepStation(step){
    if(!this.route)return;
    const index=THREE.MathUtils.clamp(nearestStationIndex(this.route,this.distance)+step*this.direction,0,this.route.stations.length-1);
    this.pause('逐站查看');this.distance=this.route.stations[index].distance_m;this.updatePosition(true);this.sync();this.requestRender();
  }
  update(time){
    if(!this.route)return false;
    const dt=this.lastTime?Math.max(0,Math.min((time-this.lastTime)/1000,.12)):0;this.lastTime=time;
    if(this.playing){
      const duration=Math.max(55,Math.min(130,this.route.length_m/700));
      this.distance=THREE.MathUtils.clamp(this.distance+dt*this.speed*this.direction*this.route.length_m/duration,0,this.route.length_m);
      this.updatePosition();
      if(this.follow)this.focusCamera(1-Math.exp(-dt*3));
      if(time-this.lastHud>140){this.lastHud=time;this.sync(false);}
      if((this.direction>0&&this.distance>=this.route.length_m)||(this.direction<0&&this.distance<=0)){this.pause('已到达终点 · 可反向巡航');this.sync();}
    }
    this.guide.scale.setScalar(this.getPixel()*30);this.updateProfileCursor();return this.playing;
  }
  updatePosition(focus=false,notify=true){
    if(!this.route)return;
    const p=sampleRoute(this.route,this.distance),height=Math.max(0,p[2]);this.current=p;
    this.guide.position.copy(this.project(p[0],p[1],(height+2)*this.getVertical()));
    const bottom=this.project(p[0],p[1],0),top=this.project(p[0],p[1],height*this.getVertical());
    this.ruler.geometry.setFromPoints([bottom,top]);this.ruler.computeLineDistances();
    const station=this.route.stations[nearestStationIndex(this.route,this.distance)];
    if(notify&&this.lastStation!==station.station_id){this.lastStation=station.station_id;this.onStation(station.station_id);}
    if(focus&&this.follow)this.focusCamera(1);
    this.updateProfileCursor();
  }
  focusCamera(blend){
    if(!this.route||!this.current)return;
    const point=this.project(this.current[0],this.current[1],Math.max(0,this.current[2])*this.getVertical());
    const before=sampleRoute(this.route,Math.max(0,this.distance-500)),after=sampleRoute(this.route,Math.min(this.route.length_m,this.distance+500));
    const tangent=this.project(after[0],after[1]).sub(this.project(before[0],before[1])).normalize().multiplyScalar(this.direction);
    if(tangent.lengthSq()<.01)tangent.set(0,0,-1);
    const side=new THREE.Vector3(-tangent.z,0,tangent.x);
    const target=point.clone().addScaledVector(tangent,.65);
    const eye=target.clone().addScaledVector(tangent,-5.5).addScaledVector(side,2.4);eye.y+=6.8;
    this.controls.target.lerp(target,blend);this.camera.position.lerp(eye,blend);
    const zoom=THREE.MathUtils.clamp(this.getSpan()/7.2,.22,25);this.camera.zoom+=(zoom-this.camera.zoom)*blend;this.camera.updateProjectionMatrix();
  }
  updateProfileCursor(){
    const cursor=this.$('#profile-cursor');if(!cursor||!this.route)return;
    const width=Number(cursor.dataset.width),x=24+this.distance/this.route.length_m*(width-48);cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);
  }
  sync(announce=true){
    if(!this.route)return;
    const route=this.route,index=nearestStationIndex(route,this.distance),station=route.stations[index];
    const upcoming=this.direction>0?route.stations.findIndex(s=>s.distance_m>this.distance+25):route.stations.findLastIndex(s=>s.distance_m<this.distance-25);
    const next=upcoming<0?null:route.stations[upcoming];
    const play=this.$('#cruise-play');play.textContent=this.playing?'Ⅱ 暂停':'▶ 开始巡航';play.setAttribute('aria-label',this.playing?'暂停线路巡航':'开始线路巡航');
    if(announce)this.$('#cruise-state').textContent=this.message;
    const first=route.stations[0].name,last=route.stations.at(-1).name;
    this.$('#cruise-direction').textContent=this.direction>0?`${first} → ${last}`:`${last} → ${first}`;
    this.$('#cruise-progress').value=Math.round(this.distance/route.length_m*1000);
    this.$('#cruise-progress').setAttribute('aria-valuetext',`线路位置 ${(this.distance/1000).toFixed(1)} 公里，靠近${station.name}`);
    this.$('#cruise-distance').textContent=`${(this.distance/1000).toFixed(1)} / ${(route.length_m/1000).toFixed(1)} km`;
    this.$('#cruise-current').textContent=station.name;
    this.$('#cruise-next-name').textContent=next?`前方 · ${next.name}`:'已到线路端点';
    this.$('#cruise-ground').textContent=this.current?.[2]<0?'高程待核对':`地表约 ${Math.round(this.current?.[2]||0)} m`;
    const tag=route.segment_tags[routeSegmentIndex(route,this.distance)],names={tunnel:'隧道',bridge:'高架 / 桥梁',surface_or_unknown:'结构未标注'};
    this.$('#cruise-structure').textContent=`OSM 标签 · ${tag.structures.map(s=>names[s]).join(' / ')}${tag.relative_layers.length?' · layer '+tag.relative_layers.join('/')+'（非米）':''}`;
    this.$('#cruise-position').textContent=`${index+1} / ${route.stations.length} 个已定位站点`;
    this.$('#cruise-prev').disabled=index-this.direction<0||index-this.direction>=route.stations.length;
    this.$('#cruise-next').disabled=index+this.direction<0||index+this.direction>=route.stations.length;
    this.$('#cruise-coverage').textContent=route.excluded_stations.length?`位置待补：${route.excluded_stations.map(s=>s.name).join('、')}`:'沿公开轨道走向 · 演示节奏';
    this.$('#cruise-reverse').setAttribute('aria-label',`切换巡航方向，当前${this.direction>0?'正向':'反向'}`);
  }
}
