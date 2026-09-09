/* Aethernfall 3.4.0 — shared raster atlases; all rectangles use source pixels. */
(() => {
  'use strict';
  const sheets = {
    characters: {src:'./assets/art/characters.webp', width:1536, height:1024},
    objects: {src:'./assets/art/objects.webp', width:1448, height:1086},
    terrain: {src:'./assets/art/terrain.webp', width:1254, height:1254}
  };
  const sprites = {
    hero: ['characters',121,8,271,494], heroBack:['characters',621,12,274,491],
    scout:['characters',1127,10,279,488], raider:['characters',126,510,267,506],
    boar:['characters',534,561,440,425], guardian:['characters',1032,498,478,518],
    pine:['objects',69,10,241,350], oak:['objects',370,20,344,333],
    rock:['objects',751,98,316,250], house:['objects',1121,14,299,339],
    ruins:['objects',57,361,278,360], shrine:['objects',398,372,293,349],
    herb:['objects',738,394,323,305], wood:['objects',1113,437,310,257],
    ore:['objects',54,761,281,291], sword:['objects',397,731,293,329],
    armor:['objects',757,733,300,330], potion:['objects',1172,740,204,303]
  };
  const images = {}, surfaces = {};
  let loading;
  function makeSurfaces(image) {
    // Mirrored repetitions share edge pixels, avoiding hard terrain tile seams.
    ['grass','stone','dirt','water'].forEach((name,index) => {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 384;
      const c = tile.getContext('2d');
      for(let y=0;y<2;y++) for(let x=0;x<2;x++) {
        c.save(); c.translate(x?384:0,y?384:0); c.scale(x?-1:1,y?-1:1);
        c.drawImage(image,(index%2)*627,Math.floor(index/2)*627,627,627,0,0,192,192);
        c.restore();
      }
      surfaces[name] = tile;
    });
  }
  function load(changed=()=>{}) {
    if(loading)return loading;
    loading = Promise.all(Object.entries(sheets).map(([name,sheet]) => new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = () => { if(!settled){settled=true;clearTimeout(timer);resolve();} };
      const timer = setTimeout(finish,2500);
      image.decoding = 'async';
      image.onload = () => {
        try {
          if(image.naturalWidth!==sheet.width||image.naturalHeight!==sheet.height)throw Error('Atlas size: '+name);
          images[name]=image;
          if(name==='terrain')makeSurfaces(image);
          changed();
        } catch(error) { console.warn('Aethernfall art',error); }
        image.onload=image.onerror=null; finish();
      };
      image.onerror = () => { image.onload=image.onerror=null;finish(); };
      image.src = new URL(sheet.src,document.baseURI).href;
    })));
    return loading;
  }
  function draw(ctx,name,x,y,height,flip=false) {
    const rect=sprites[name];
    if(!rect||!images[rect[0]])return false;
    const width=height*rect[3]/rect[4];
    ctx.save();ctx.translate(x,y);if(flip)ctx.scale(-1,1);
    ctx.drawImage(images[rect[0]],rect[1],rect[2],rect[3],rect[4],-width/2,-height,width,height);
    ctx.restore();return true;
  }
  function patterns(ctx) {
    const result={};for(const [name,tile] of Object.entries(surfaces))result[name]=ctx.createPattern(tile,'repeat');
    return result;
  }
  function icon(name) {
    const r=sprites[name];if(!r)return '';
    const sheet=sheets[r[0]];
    return `<svg class="assetIcon" aria-hidden="true" viewBox="${r.slice(1).join(' ')}"><image href="${sheet.src}" width="${sheet.width}" height="${sheet.height}"/></svg>`;
  }
  window.AetherArt={load,draw,patterns,icon,has:name=>!!images[sprites[name]?.[0]],get terrainReady(){return !!surfaces.grass}};
})();
