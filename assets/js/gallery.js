(function () {
  // --- state
  let currentIndex = -1, currentCards = [], currentGallery = null;
  let isDown = false, startX = 0, startY = 0, startT = 0, suppressNextClick = false;

  // animation/pending state
  let isAnimating = false, animToken = 0, currentAnimDir = 0; // +1 prev, -1 next
  let activeSlot = 0, imgA, imgB;

  // --- tuning
  const CLICK_SUPPRESS_PX = 6;
  const MIN_PX = 40, MIN_VEL = 0.55, SWIPE_MAX_Y = 80, TRANSITION_MS = 250;
  const OFF_VW = 0.44, OFF_PX_MAX = 280;
  const HUMP_RATIO = 0.50;
  const NAV_COOLDOWN_MS = 140; // throttle only for *held* keys
  const LOADER_DELAY_MS = 120;

  const DEFAULT_TRANSITION  = "transform .25s ease, opacity .25s ease";
  const OUT_FAST_TRANSITION = "transform .25s ease, opacity .12s ease";

  let lastNavAt = 0;
  const canNavNow = () => { const t = performance.now(); if (t - lastNavAt < NAV_COOLDOWN_MS) return false; lastNavAt = t; return true; };

  // --- utils
  const els = () => ({
    modalEl: document.getElementById("gl-lightbox"),
    modalInner: document.querySelector(".gl-modal"),
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const offPreview = () => Math.min(Math.round(window.innerWidth * OFF_VW), OFF_PX_MAX);
  const humpPx = () => Math.round(offPreview() * HUMP_RATIO);
  const baseTransform = (px=0) => `translate(-50%, -50%) translateX(${px}px)`;
  const decisive = p => 1/(1+Math.exp(-7.5*(clamp(p,0,1)-0.5)));

  function setImmediateNoAnim(node, fn) {
    if (!node) return;
    const prev = node.style.transition;
    node.style.transition = "none"; fn(); node.offsetWidth; node.style.transition = prev || "";
  }
  function waitImageReady(url) {
    return new Promise((res, rej) => {
      const img = new Image(); img.decoding="async"; try{img.fetchPriority="high";}catch{}
      img.onload = async () => { try{ if (img.decode) await img.decode(); } catch{} res(img); };
      img.onerror = rej; img.src = url;
    });
  }
  function waitTransitionEnd(node, token) {
    return new Promise(r => {
      let done=false; const onEnd=()=>{ if(!done){done=true; node.removeEventListener("transitionend",onEnd); r();} };
      node.addEventListener("transitionend", onEnd, { once:true });
      setTimeout(onEnd, TRANSITION_MS+120);
    }).then(()=> token===animToken);
  }
  function lockScroll(lock){ document.body.classList.toggle("gl-lock", !!lock); }
  function setModalCursor(anim){ const {modalInner}=els(); if(modalInner) modalInner.style.cursor = anim ? "default" : "zoom-out"; }

  // --- tiny preload cache + readiness flag
  const preloadCache = new Map();      // url -> Promise
  const readySet = new Set();          // urls that have fully decoded
  function preload(url){
    if(!url) return Promise.resolve();
    if(readySet.has(url)) return Promise.resolve();
    if(preloadCache.has(url)) return preloadCache.get(url);
    const p = waitImageReady(url).then(()=>{ readySet.add(url); }).catch(()=>{});
    preloadCache.set(url, p);
    return p;
  }
  const isReady = (url)=> !!url && readySet.has(url);

  // --- spinner
  let loaderEl=null, loadTimer=null;
  function ensureLoader(){
    const {modalInner}=els();
    if(!loaderEl){
      loaderEl = document.createElement("div");
      loaderEl.className = "gl-loading";
      loaderEl.innerHTML = '<div class="gl-spinner" aria-hidden="true"></div>';
      Object.assign(loaderEl.style, { display:"none" });
      modalInner.appendChild(loaderEl);
    }
  }
  function showLoader(){ ensureLoader(); if(loadTimer) clearTimeout(loadTimer); loadTimer=setTimeout(()=>{ loaderEl.style.display='grid'; }, LOADER_DELAY_MS); }
  function hideLoader(){ if(loadTimer){ clearTimeout(loadTimer); loadTimer=null; } if(loaderEl) loaderEl.style.display='none'; }
  const loaderVisible = ()=> loaderEl && loaderEl.style.display==='grid';

  // --- layers
  function applyImgBaseStyles(img){
    Object.assign(img.style,{
      position:"absolute", top:"50%", left:"50%", zIndex:"1", display:"block",
      maxWidth:"95vw", maxHeight:"90vh", objectFit:"contain",
      cursor:"default", userSelect:"none", WebkitUserDrag:"none",
      transition:DEFAULT_TRANSITION, willChange:"transform,opacity",
      transform:baseTransform(0), opacity:"1", pointerEvents:"none",
    });
    img.setAttribute("draggable","false");
  }
  function ensureImages(){
    const {modalInner}=els();
    let existing=document.getElementById("gl-full");
    if(existing){ imgA=existing; } else {
      imgA=document.createElement("img"); imgA.id="gl-full";
      modalInner.insertBefore(imgA, modalInner.querySelector(".gl-arrow") || null);
    }
    applyImgBaseStyles(imgA);
    if(!imgB){ imgB=document.createElement("img"); imgB.id="gl-full-2"; applyImgBaseStyles(imgB); imgB.style.opacity="0"; imgA.insertAdjacentElement("afterend", imgB); }
    imgA.style.pointerEvents="auto"; imgB.style.pointerEvents="none";
  }
  const currentImg = ()=> activeSlot===0? imgA:imgB;
  const incomingImg= ()=> activeSlot===0? imgB:imgA;
  function setActivePointerTargets(active){ const other=(active===imgA?imgB:imgA); active.style.pointerEvents="auto"; other.style.pointerEvents="none"; }

  // --- modal helpers
  function openModalIfNeeded(){ const {modalEl}=els(); if(!modalEl.classList.contains("is-open")){ modalEl.classList.add("is-open"); modalEl.setAttribute("aria-hidden","false"); lockScroll(true); setModalCursor(false); } }
  function close(){
    const {modalEl}=els(); if(!modalEl) return;
    modalEl.classList.remove("is-open"); modalEl.setAttribute("aria-hidden","true");
    lockScroll(false); setModalCursor(false); hideLoader();
    currentIndex=-1; currentCards=[]; currentGallery=null; isDown=false; isAnimating=false; animToken++; currentAnimDir=0;
    if(imgA&&imgB){ [imgA,imgB].forEach(img=> setImmediateNoAnim(img,()=>{ img.style.transform=baseTransform(0); img.style.opacity="0"; img.style.zIndex="1"; img.style.pointerEvents="none"; img.removeAttribute("src"); img.removeAttribute("alt"); })); activeSlot=0; }
  }

  function setImageImmediate(img, url, alt){
    setImmediateNoAnim(img, ()=>{
      img.style.transform=baseTransform(0); img.style.opacity="1"; img.src=url; img.alt=alt||""; img.style.zIndex="2";
      const other=(img===imgA?imgB:imgA); other.style.zIndex="1"; other.style.opacity="0"; other.style.transform=baseTransform(0);
      setActivePointerTargets(img);
    });
  }
  function urlAltFor(i){
    if(i<0) i=currentCards.length-1; if(i>=currentCards.length) i=0;
    const c=currentCards[i]; return [c.getAttribute("data-full"), c.getAttribute("data-alt")||""];
  }

  function primeNeighbors(){
    const conn = navigator.connection;
    const skip = conn && (conn.saveData || /(^|[^3-9])2g/i.test(conn.effectiveType||""));
    if(skip) return;
    const [nurl] = urlAltFor(currentIndex+1);
    const [purl] = urlAltFor(currentIndex-1);
    preload(nurl); preload(purl);
  }

  // --- FAST-FINISH current animation
  function fastFinishAnimation(){
    if(!isAnimating || loaderVisible()) return false; // don't fast-finish a loader phase
    const dir = currentAnimDir || -1;
    const out = currentImg();
    const inc = incomingImg();
    const W = offPreview();
    const entryDir = -dir;
    const outGoal = -entryDir * W;
    setImmediateNoAnim(out, ()=>{ out.style.transform=baseTransform(outGoal); out.style.opacity="0"; out.style.zIndex="1"; });
    setImmediateNoAnim(inc, ()=>{ inc.style.transform=baseTransform(0); inc.style.opacity="1"; inc.style.zIndex="2"; });
    currentIndex = (dir>0) ? (currentIndex-1+currentCards.length)%currentCards.length
                           : (currentIndex+1)%currentCards.length;
    activeSlot = 1 - activeSlot;
    isAnimating = false; currentAnimDir = 0;
    setActivePointerTargets(currentImg()); setModalCursor(false);
    primeNeighbors();
    return true;
  }

  // --- commit animation (from drag) when incoming is ready
  function animateCommitFromDrag(dir, done){
    const targetIndex = dir>0 ? currentIndex-1 : currentIndex+1;
    const entryDir = -dir;
    const token = ++animToken; isAnimating = true; currentAnimDir = dir; setModalCursor(true);

    const out=currentImg(), inc=incomingImg();
    const [url,alt]=urlAltFor(targetIndex);
    const W=offPreview(), off=entryDir*W, outGoal=-off;

    if(!inc.src || inc.src.endsWith("about:blank")){
      setImmediateNoAnim(inc, ()=>{ inc.src=url; inc.alt=alt; inc.style.transform=baseTransform(off); inc.style.opacity="0"; });
    }

    inc.style.zIndex="2"; out.style.zIndex="1";
    out.style.pointerEvents="none"; inc.style.pointerEvents="none";
    out.offsetWidth;

    const prevTrans=out.style.transition; out.style.transition=OUT_FAST_TRANSITION;
    requestAnimationFrame(()=>{
      out.style.transform=baseTransform(outGoal); out.style.opacity="0";
      inc.style.transform=baseTransform(0);       inc.style.opacity="1";
    });

    waitTransitionEnd(inc, token).then(ok=>{
      out.style.transition=prevTrans || DEFAULT_TRANSITION; if(!ok) return;
      setImmediateNoAnim(out, ()=>{ out.style.transform=baseTransform(0); out.style.opacity="0"; out.style.zIndex="1"; });
      inc.style.zIndex="2";
      currentIndex = (dir>0) ? (currentIndex-1+currentCards.length)%currentCards.length
                             : (currentIndex+1)%currentCards.length;
      activeSlot = 1 - activeSlot; isAnimating=false; currentAnimDir=0;
      setActivePointerTargets(currentImg()); setModalCursor(false);
      primeNeighbors();
      if(done) done();
    });
  }

  // --- NEW: pending commit with spinner if incoming *not* ready yet
  function commitWithPreload(dir, done){
    const targetIndex = dir>0 ? currentIndex-1 : currentIndex+1;
    const [url, alt] = urlAltFor(targetIndex);

    // If decoded already, go straight to animated commit.
    if (isReady(url)) { animateCommitFromDrag(dir, done); return; }

    // Otherwise: enter a "pending" state: fade out current, show spinner, wait, then fade in new.
    const token = ++animToken; isAnimating = true; currentAnimDir = 0; // no directional anim running now
    setModalCursor(true);

    const out = currentImg();
    const inc = incomingImg();

    // Immediately fade out the current image so we don't show stale frames.
    setImmediateNoAnim(out, ()=>{ out.style.opacity="0"; out.style.transform=baseTransform(0); out.style.zIndex="1"; out.style.pointerEvents="none"; });
    setImmediateNoAnim(inc, ()=>{ inc.style.opacity="0"; inc.style.transform=baseTransform(0); inc.style.zIndex="1"; inc.style.pointerEvents="none"; });

    showLoader();

    // Start/ensure preload and, once ready, reveal *without* ever flashing the old photo.
    preload(url).then(()=> {
      if (animToken !== token) return; // superseded by a newer action
      hideLoader();

      // Place incoming on the correct side and animate in (quickly) to center.
      const entryDir = -dir;
      const W = offPreview();
      const off = entryDir * W;

      setImmediateNoAnim(inc, ()=>{
        inc.src = url; inc.alt = alt;
        inc.style.transform = baseTransform(off);
        inc.style.opacity = "0";
        inc.style.zIndex = "2";
      });

      // small async to ensure style commit
      requestAnimationFrame(()=>{
        currentAnimDir = dir;
        inc.style.transform = baseTransform(0);
        inc.style.opacity   = "1";
        waitTransitionEnd(inc, token).then(ok=>{
          if(!ok) return;
          currentIndex = (dir>0) ? (currentIndex-1+currentCards.length)%currentCards.length
                                 : (currentIndex+1)%currentCards.length;
          activeSlot = (inc===imgA?0:1);
          isAnimating = false; currentAnimDir = 0;
          setActivePointerTargets(inc);
          setModalCursor(false);
          primeNeighbors();
          if (done) done();
        });
      });
    }).catch(()=> {
      // On error: hide loader, try to recover by just swapping with no anim.
      if (animToken !== token) return;
      hideLoader();
      setImageImmediate(incomingImg(), url, alt);
      currentIndex = (dir>0) ? (currentIndex-1+currentCards.length)%currentCards.length
                             : (currentIndex+1)%currentCards.length;
      activeSlot = 1 - activeSlot; isAnimating=false; currentAnimDir=0;
      setActivePointerTargets(currentImg()); setModalCursor(false);
      primeNeighbors();
      if (done) done();
    });
  }

  // --- instant show (keys/arrows) with preload awareness
  function show(index){
    if(!currentCards.length) return;
    if(index<0) index=currentCards.length-1; if(index>=currentCards.length) index=0; currentIndex=index;
    const c=currentCards[currentIndex], url=c.getAttribute("data-full"), alt=c.getAttribute("data-alt")||"";
    openModalIfNeeded(); ensureImages();

    if (isReady(url)) {
      setImageImmediate(currentImg(), url, alt);
      primeNeighbors();
    } else {
      showLoader();
      preload(url).then(()=>{ hideLoader(); setImageImmediate(currentImg(), url, alt); primeNeighbors(); })
                  .catch(()=>{ hideLoader(); setImageImmediate(currentImg(), url, alt); primeNeighbors(); });
    }
  }

  // --- open from grid: preload then reveal (no flashing)
  function openFromCard(card){
    currentGallery = card.closest(".gl-gallery") || document;
    currentCards   = Array.from(currentGallery.querySelectorAll(".gl-card"));
    currentIndex   = currentCards.indexOf(card);
    const url = card.getAttribute("data-full"), alt = card.getAttribute("data-alt")||"";
    ensureImages();

    [imgA,imgB].forEach(img=> setImmediateNoAnim(img,()=>{ img.style.transform=baseTransform(0); img.style.opacity="0"; img.style.zIndex="1"; img.style.pointerEvents="none"; img.removeAttribute("src"); img.removeAttribute("alt"); }));

    showLoader();
    preload(url).then(()=>{
      hideLoader();
      setImageImmediate(currentImg(), url, alt);
      openModalIfNeeded();
      setImmediateNoAnim(incomingImg(),()=>{ incomingImg().style.transform=baseTransform(0); incomingImg().style.opacity="0"; incomingImg().style.zIndex="1"; incomingImg().style.pointerEvents="none"; });
      primeNeighbors();
    }).catch(()=>{
      hideLoader();
      openModalIfNeeded();
      setImageImmediate(currentImg(), url, alt);
      primeNeighbors();
    });
  }

  // --- Drag with live preview
  let previewDir=0, previewIndex=-1;

  function ensurePreview(dir){
    if(previewDir===dir) return;
    previewDir=dir; previewIndex = dir>0 ? currentIndex-1 : currentIndex+1;
    const [url,alt]=urlAltFor(previewIndex), inc=incomingImg();
    const W=offPreview(), off=(-dir)*W;
    preload(url);
    setImmediateNoAnim(inc, ()=>{ inc.src=url; inc.alt=alt; inc.style.transform=baseTransform(off); inc.style.opacity="0"; inc.style.zIndex="2"; inc.style.pointerEvents="none"; });
    currentImg().style.zIndex="1"; currentImg().style.pointerEvents="auto";
  }

  function onPointerDown(e){
    const {modalEl}=els(); if(!modalEl.classList.contains("is-open")) return;

    // If we're in a spinner/pending state, cancel previous pending by bumping token
    if (isAnimating && loaderVisible()) { animToken++; isAnimating=false; currentAnimDir=0; hideLoader(); }

    // If animating a normal transition, fast-finish to the correct end, then accept new swipe
    if (isAnimating && !loaderVisible()) fastFinishAnimation();

    isDown=true; startX=e.clientX??0; startY=e.clientY??0; startT=performance.now(); suppressNextClick=false;
    e.preventDefault();

    const out=currentImg(), inc=incomingImg();
    setImmediateNoAnim(out, ()=>{ out.style.transform=baseTransform(0); out.style.opacity="1"; out.style.zIndex="1"; out.style.pointerEvents="auto"; });
    setImmediateNoAnim(inc, ()=>{ inc.style.transform=baseTransform(0); inc.style.opacity="0"; inc.style.zIndex="2"; inc.style.pointerEvents="none"; });
  }
  function onPointerMove(e){
    if(!isDown || isAnimating) return;
    const x=e.clientX??0, y=e.clientY??0, dx=x-startX, dy=Math.abs(y-startY);
    if(Math.abs(dx)>CLICK_SUPPRESS_PX) suppressNextClick=true; if(dy>SWIPE_MAX_Y) return;

    const out=currentImg(), inc=incomingImg();
    inc.style.zIndex="2"; out.style.zIndex="1";

    const fadeBase = Math.min(Math.abs(dx)/200, 0.4);
    const pastHump = Math.abs(dx) >= humpPx();
    out.style.transform=baseTransform(dx);
    out.style.opacity  = String(clamp(1 - (fadeBase + (pastHump?0.15:0)), 0, 1));

    if(Math.abs(dx)>10){
      const dir = dx>0 ? +1 : -1; ensurePreview(dir);
      const W=offPreview(), off=(-dir)*W;
      const pDec = decisive(clamp(Math.abs(dx)/W, 0, 1));
      inc.style.transform=baseTransform(off*(1-pDec));
      inc.style.opacity  = String(pDec);
    }
  }
  function onPointerUp(e){
    if(!isDown) return; isDown=false;
    const endX=e.clientX??startX, dt=Math.max(1, performance.now()-startT);
    const dx=endX-startX, vel=Math.abs(dx)/dt, dir=dx>0 ? +1 : -1;
    const commit = (Math.abs(dx)>=humpPx()) || (Math.abs(dx)>=MIN_PX && vel>=MIN_VEL);

    if(!commit){
      const out=currentImg(), inc=incomingImg(), W=offPreview(), off=(-dir)*W;
      out.style.transform=baseTransform(0); out.style.opacity="1"; out.style.pointerEvents="auto";
      if(previewDir!==0){ inc.style.transform=baseTransform(off); inc.style.opacity="0"; inc.style.zIndex="2"; inc.style.pointerEvents="none"; setTimeout(()=>{ inc.style.zIndex="1"; }, TRANSITION_MS); }
      else { inc.style.zIndex="1"; inc.style.pointerEvents="none"; }
      previewDir=0; previewIndex=-1; return;
    }

    // If incoming not ready, go pending (fade out current + spinner). If ready, animate commit.
    const [url] = urlAltFor(dir>0 ? currentIndex-1 : currentIndex+1);
    isReady(url) ? animateCommitFromDrag(dir, ()=>{ previewDir=0; previewIndex=-1; })
                 : commitWithPreload(dir, ()=>{ previewDir=0; previewIndex=-1; });
  }

  // instant (keys/arrows): fast-finish if needed, then jump (no spinner unless first load)
  const goPrevInstant = ()=>{ if(isAnimating && !loaderVisible()) fastFinishAnimation(); if(currentCards.length) show(currentIndex-1); };
  const goNextInstant = ()=>{ if(isAnimating && !loaderVisible()) fastFinishAnimation(); if(currentCards.length) show(currentIndex+1); };

  // click handlers
  function clickIsBetweenImages(x, y){
    const a = imgA, b = imgB;
    const oa = parseFloat(getComputedStyle(a).opacity||"0");
    const ob = parseFloat(getComputedStyle(b).opacity||"0");
    if (oa < 0.05 || ob < 0.05) return false;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ca = (ra.left+ra.right)/2, cb = (rb.left+rb.right)/2;
    const leftRect  = ca <= cb ? ra : rb;
    const rightRect = ca <= cb ? rb : ra;
    if (leftRect.right >= rightRect.left) return false;
    const inX = x >= leftRect.right && x <= rightRect.left;
    const inY = y >= Math.min(ra.top, rb.top) && y <= Math.max(ra.bottom, rb.bottom);
    return inX && inY;
  }

  document.addEventListener("click", (e)=>{
    const card = e.target.closest(".gl-card");
    if(card){ openFromCard(card); return; }

    const {modalEl}=els(); if(!modalEl) return;

    if(e.target.matches("[data-gl-close]")){ close(); return; }
    if(e.target.closest(".gl-arrow")){
      if(e.target.matches("[data-gl-prev]")) { if(e.repeat && !canNavNow()) return; goPrevInstant(); }
      else if(e.target.matches("[data-gl-next]")){ if(e.repeat && !canNavNow()) return; goNextInstant(); }
      return;
    }

    // Backdrop click to close; ignore clicks on image or the between-image gap during drag.
    if(modalEl.classList.contains("is-open")){
      const a = currentImg();
      if(a && a.src){
        const r=a.getBoundingClientRect(), x=e.clientX, y=e.clientY;
        const op=parseFloat(getComputedStyle(a).opacity||"0");
        const inside = x>=r.left && x<=r.right && y>=r.top && y<=r.bottom && op>0.05;
        if(inside || clickIsBetweenImages(x, y)) return;
      }
      close(); return;
    }
  });

  document.addEventListener("keydown", (e)=>{
    const {modalEl}=els(); if(!modalEl || !modalEl.classList.contains("is-open")) return;
    if(e.key==="Escape"){ close(); return; }
    if(e.key==="ArrowLeft"){ if(e.repeat && !canNavNow()) return; goPrevInstant(); return; }
    if(e.key==="ArrowRight"){ if(e.repeat && !canNavNow()) return; goNextInstant(); return; }
  });

  // block wheel/touch scroll while modal is open
  function blockScrollEvents(node){
    const handler = ev => { const {modalEl}=els(); if(modalEl && modalEl.classList.contains("is-open")) ev.preventDefault(); };
    node.addEventListener("wheel", handler, {passive:false});
    node.addEventListener("touchmove", handler, {passive:false});
  }

  // open from grid, preload neighbors on ready
  function openFromCard(card){
    currentGallery = card.closest(".gl-gallery") || document;
    currentCards   = Array.from(currentGallery.querySelectorAll(".gl-card"));
    currentIndex   = currentCards.indexOf(card);
    const url = card.getAttribute("data-full"), alt = card.getAttribute("data-alt")||"";
    ensureImages();

    [imgA,imgB].forEach(img=> setImmediateNoAnim(img,()=>{ img.style.transform=baseTransform(0); img.style.opacity="0"; img.style.zIndex="1"; img.style.pointerEvents="none"; img.removeAttribute("src"); img.removeAttribute("alt"); }));

    showLoader();
    preload(url).then(()=>{
      hideLoader();
      setImageImmediate(currentImg(), url, alt);
      openModalIfNeeded();
      setImmediateNoAnim(incomingImg(),()=>{ incomingImg().style.transform=baseTransform(0); incomingImg().style.opacity="0"; incomingImg().style.zIndex="1"; incomingImg().style.pointerEvents="none"; });
      primeNeighbors();
    }).catch(()=>{
      hideLoader();
      openModalIfNeeded();
      setImageImmediate(currentImg(), url, alt);
      primeNeighbors();
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    const {modalInner}=els(); if(modalInner) blockScrollEvents(modalInner);
    if(modalInner){
      modalInner.addEventListener("pointerdown", onPointerDown, {passive:false});
      modalInner.addEventListener("pointermove", onPointerMove, {passive:false});
      modalInner.addEventListener("pointerup", onPointerUp);
      modalInner.addEventListener("pointercancel", ()=>{ isDown = false; });
    }
  });
})();
